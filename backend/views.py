import heapq
import math
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
