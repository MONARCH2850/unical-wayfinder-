from django.urls import path
from . import views

urlpatterns = [
    path('api/login/', views.login),
    path('api/register/', views.register),
    path('api/locations/', views.locations),
    path('api/routes/', views.routes),
    path('api/live-location/', views.live_location),
    path('api/accessibility/', views.accessibility),
]
