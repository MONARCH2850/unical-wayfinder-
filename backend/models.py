from django.conf import settings
from django.contrib.gis.db import models
from django.contrib.gis.geos import Point


class Location(models.Model):
    user = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.SET_NULL, null=True, blank=True)
    name = models.CharField(max_length=160)
    latitude = models.FloatField()
    longitude = models.FloatField()
    point = models.PointField(geography=True, null=True, blank=True)
    geotag_comment = models.TextField(blank=True)

    def save(self, *args, **kwargs):
        self.point = Point(self.longitude, self.latitude, srid=4326)
        super().save(*args, **kwargs)


class Route(models.Model):
    route_id = models.BigAutoField(primary_key=True)
    start_location = models.ForeignKey(Location, related_name='routes_from', on_delete=models.CASCADE)
    end_location = models.ForeignKey(Location, related_name='routes_to', on_delete=models.CASCADE)
    total_distance = models.FloatField(default=0)
    total_time = models.FloatField(default=0)
    accessibility_rating = models.FloatField(default=0)
    geometry = models.LineStringField(geography=True, null=True, blank=True)


class AccessibilityFeature(models.Model):
    feature_id = models.BigAutoField(primary_key=True)
    feature_type = models.CharField(max_length=40)
    location = models.ForeignKey(Location, related_name='accessibility_features', on_delete=models.CASCADE, null=True, blank=True)
    route = models.ForeignKey(Route, related_name='accessibility_features', on_delete=models.CASCADE, null=True, blank=True)
    description = models.TextField(blank=True)
    is_step_free = models.BooleanField(default=False)
    has_ramp = models.BooleanField(default=False)
    slope_incline = models.FloatField(default=0)
