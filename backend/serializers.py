from django.contrib.auth import authenticate, get_user_model
from rest_framework import serializers
from .models import AccessibilityFeature, Location, Route


class LocationSerializer(serializers.ModelSerializer):
    class Meta:
        model = Location
        fields = ('id', 'name', 'latitude', 'longitude', 'geotag_comment')


class AccessibilityFeatureSerializer(serializers.ModelSerializer):
    class Meta:
        model = AccessibilityFeature
        fields = ('feature_id', 'feature_type', 'location', 'route', 'description', 'is_step_free', 'has_ramp', 'slope_incline')


class RouteSerializer(serializers.ModelSerializer):
    class Meta:
        model = Route
        fields = ('route_id', 'start_location', 'end_location', 'total_distance', 'total_time', 'accessibility_rating', 'geometry')


class CredentialsSerializer(serializers.Serializer):
    username = serializers.CharField()
    password = serializers.CharField(write_only=True)

    def validate(self, attrs):
        user = authenticate(username=attrs['username'], password=attrs['password'])
        if not user:
            raise serializers.ValidationError('Invalid credentials.')
        attrs['user'] = user
        return attrs


class RegisterSerializer(serializers.ModelSerializer):
    password = serializers.CharField(write_only=True, min_length=8)

    class Meta:
        model = get_user_model()
        fields = ('username', 'email', 'password')

    def create(self, validated_data):
        return get_user_model().objects.create_user(**validated_data)
