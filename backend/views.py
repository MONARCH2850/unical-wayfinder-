import heapq
import math
import os
import json
from urllib.error import HTTPError, URLError
from urllib.parse import urlencode
from urllib.request import Request, urlopen
from django.db import transaction
from django.contrib.auth import get_user_model
from rest_framework import permissions, status
from rest_framework.authentication import TokenAuthentication
from rest_framework.authtoken.models import Token
from rest_framework.decorators import api_view, permission_classes
from rest_framework.response import Response
from .models import AccessibilityFeature, Location
from .serializers import (AccessibilityFeatureSerializer, CredentialsSerializer,
                          LocationSerializer, RegisterSerializer)


def token_response(user, code=status.HTTP_200_OK):
    token, _ = Token.objects.get_or_create(user=user)
    return Response({'token': token.key, 'user': {'id': user.id, 'username': user.username}}, status=code)


@api_view(['POST'])
@permission_classes([permissions.AllowAny])
def login(request):
    serializer = CredentialsSerializer(data=request.data)
    serializer.is_valid(raise_exception=True)
    return token_response(serializer.validated_data['user'])


@api_view(['POST'])
@permission_classes([permissions.AllowAny])
def register(request):
    serializer = RegisterSerializer(data=request.data)
    serializer.is_valid(raise_exception=True)
    return token_response(serializer.save(), status.HTTP_201_CREATED)


@api_view(['GET'])
@permission_classes([permissions.AllowAny])
def locations(request):
    queryset = Location.objects.all()
    if request.query_params.get('near'):
        latitude, longitude = map(float, request.query_params['near'].split(','))
        queryset = sorted(queryset, key=lambda place: distance((latitude, longitude), (place.latitude, place.longitude)))
    return Response(LocationSerializer(queryset, many=True).data)


@api_view(['POST'])
@permission_classes([permissions.AllowAny])
def google_directions(request):
    start = request.data.get('start')
    end = request.data.get('end')
    if not isinstance(start, list) or not isinstance(end, list) or len(start) != 2 or len(end) != 2:
        return Response({'detail': 'start and end must be [latitude, longitude].'}, status=status.HTTP_400_BAD_REQUEST)
    try:
        start_latitude, start_longitude = map(float, start)
        end_latitude, end_longitude = map(float, end)
    except (TypeError, ValueError):
        return Response({'detail': 'start and end coordinates must be numeric.'}, status=status.HTTP_400_BAD_REQUEST)
    if not all(-90 <= latitude <= 90 for latitude in (start_latitude, end_latitude)) or not all(-180 <= longitude <= 180 for longitude in (start_longitude, end_longitude)):
        return Response({'detail': 'Coordinates are outside valid geographic bounds.'}, status=status.HTTP_400_BAD_REQUEST)

    api_key = os.environ.get('GOOGLE_MAPS_API_KEY')
    if not api_key:
        return Response({'detail': 'Google Directions is not configured on the backend.'}, status=status.HTTP_503_SERVICE_UNAVAILABLE)

    query = urlencode({
        'origin': f'{start_latitude},{start_longitude}',
        'destination': f'{end_latitude},{end_longitude}',
        'mode': 'walking',
        'overview': 'full',
        'key': api_key,
    })
    request_url = f'https://maps.googleapis.com/maps/api/directions/json?{query}'
    try:
        with urlopen(Request(request_url, headers={'Accept': 'application/json'}), timeout=10) as response:
            payload = json.loads(response.read().decode('utf-8'))
    except (HTTPError, URLError, TimeoutError, ValueError):
        return Response({'detail': 'Google Directions is temporarily unavailable.'}, status=status.HTTP_502_BAD_GATEWAY)

    if payload.get('status') != 'OK' or not payload.get('routes'):
        return Response({'detail': payload.get('error_message') or f"Google Directions returned {payload.get('status', 'UNKNOWN')}."}, status=status.HTTP_502_BAD_GATEWAY)
    route = payload['routes'][0]
    leg = route.get('legs', [{}])[0]
    return Response({
        'overview_polyline': route.get('overview_polyline', {}).get('points', ''),
        'distance': leg.get('distance', {}),
        'duration': leg.get('duration', {}),
        'steps': [
            {
                'html_instructions': step.get('html_instructions', ''),
                'distance': step.get('distance', {}),
                'duration': step.get('duration', {}),
                'polyline': step.get('polyline', {}).get('points', ''),
            }
            for step in leg.get('steps', [])
        ],
    })


@api_view(['POST'])
@permission_classes([permissions.AllowAny])
def sync_spots(request):
    if not isinstance(request.data, list):
        return Response({'detail': 'The request body must be a JSON array of spots.'}, status=status.HTTP_400_BAD_REQUEST)

    required_fields = {'name', 'latitude', 'longitude', 'feature_type', 'is_accessible'}
    locations_to_create = []
    for index, spot in enumerate(request.data):
        if not isinstance(spot, dict):
            return Response({'detail': f'Spot at index {index} must be an object.'}, status=status.HTTP_400_BAD_REQUEST)
        missing_fields = required_fields - spot.keys()
        if missing_fields:
            return Response({'detail': f'Spot at index {index} is missing: {", ".join(sorted(missing_fields))}.'}, status=status.HTTP_400_BAD_REQUEST)
        try:
            name = str(spot['name']).strip()
            latitude = float(spot['latitude'])
            longitude = float(spot['longitude'])
        except (TypeError, ValueError):
            return Response({'detail': f'Spot at index {index} has invalid name or coordinates.'}, status=status.HTTP_400_BAD_REQUEST)
        if not name or not -90 <= latitude <= 90 or not -180 <= longitude <= 180:
            return Response({'detail': f'Spot at index {index} has invalid name or coordinates.'}, status=status.HTTP_400_BAD_REQUEST)
        if not isinstance(spot['is_accessible'], bool):
            return Response({'detail': f'Spot at index {index} must use a boolean is_accessible value.'}, status=status.HTTP_400_BAD_REQUEST)
        feature_type = str(spot['feature_type'] or '').strip()
        if len(name) > 160 or len(feature_type) > 40:
            return Response({'detail': f'Spot at index {index} exceeds a field length limit.'}, status=status.HTTP_400_BAD_REQUEST)
        locations_to_create.append((name, latitude, longitude, feature_type, spot['is_accessible']))

    # Keep the upload all-or-nothing so a partial phone queue is never persisted.
    created_count = 0
    with transaction.atomic():
        for name, latitude, longitude, feature_type, is_accessible in locations_to_create:
            if Location.objects.filter(name=name, latitude=latitude, longitude=longitude).exists():
                continue
            location = Location.objects.create(name=name, latitude=latitude, longitude=longitude)
            created_count += 1
            if feature_type:
                AccessibilityFeature.objects.create(
                    location=location,
                    feature_type=feature_type,
                    is_step_free=is_accessible,
                    has_ramp=is_accessible,
                )

    return Response({'status': 'success', 'created': created_count, 'message': f'Successfully pushed {created_count} new spots to the backend database.'}, status=status.HTTP_201_CREATED)


def distance(start, end):
    lat_delta = math.radians(end[0] - start[0])
    lng_delta = math.radians(end[1] - start[1])
    return math.hypot(lat_delta, lng_delta) * 6371000


def accessible_graph(features, accessibility_mode):
    graph = {}
    for feature in features:
        if not feature.location or not feature.route:
            continue
        blocked = accessibility_mode and (not feature.is_step_free or feature.slope_incline > 8 or feature.feature_type in {'stairs', 'obstacle'})
        if not blocked:
            graph.setdefault(feature.route.start_location_id, []).append((feature.route.end_location_id, feature.route.total_distance))
    return graph


def shortest_path(graph, start_id, end_id):
    queue = [(0, start_id, [start_id])]
    best = {start_id: 0}
    while queue:
        cost, node, path = heapq.heappop(queue)
        if node == end_id:
            return cost, path
        if cost != best.get(node):
            continue
        for neighbor, edge_cost in graph.get(node, []):
            next_cost = cost + edge_cost
            if next_cost < best.get(neighbor, float('inf')):
                best[neighbor] = next_cost
                heapq.heappush(queue, (next_cost, neighbor, path + [neighbor]))
    return None, None


@api_view(['POST'])
@permission_classes([permissions.AllowAny])
def routes(request):
    start = request.data.get('start')
    end = request.data.get('end')
    mode = request.data.get('accessibility_mode')
    if not isinstance(start, list) or not isinstance(end, list):
        return Response({'detail': 'start and end must be [latitude, longitude].'}, status=400)
    # The graph is sourced from persisted route features; direct fallback preserves normal walking.
    features = AccessibilityFeature.objects.select_related('route', 'location').all()
    graph = accessible_graph(features, mode in {'wheelchair', 'step_free'})
    result = {'start': start, 'end': end, 'accessibility_mode': mode, 'accessibility_rating': 1 if mode else 0, 'path': [start, end], 'total_distance': distance(start, end), 'total_time': distance(start, end) / 1.4}
    if graph:
        start_place = min(Location.objects.all(), key=lambda place: distance(start, (place.latitude, place.longitude)), default=None)
        end_place = min(Location.objects.all(), key=lambda place: distance(end, (place.latitude, place.longitude)), default=None)
        graph_distance, graph_path = shortest_path(graph, start_place.id, end_place.id) if start_place and end_place else (None, None)
        if graph_path:
            result['graph_nodes'] = graph_path
            result['total_distance'] = graph_distance
            result['total_time'] = graph_distance / 1.4
    return Response(result)


@api_view(['GET'])
@permission_classes([permissions.IsAuthenticated])
def live_location(request):
    return Response({'user_id': request.user.id, 'latitude': request.query_params.get('latitude'), 'longitude': request.query_params.get('longitude'), 'timestamp': request.headers.get('X-Location-Timestamp')})


@api_view(['GET'])
@permission_classes([permissions.AllowAny])
def accessibility(request):
    features = AccessibilityFeature.objects.all()
    return Response(AccessibilityFeatureSerializer(features, many=True).data)
