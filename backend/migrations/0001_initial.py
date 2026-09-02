from django.conf import settings
from django.contrib.gis.db import migrations, models
import django.db.models.deletion


class Migration(migrations.Migration):
    initial = True
    dependencies = [migrations.swappable_dependency(settings.AUTH_USER_MODEL)]
    operations = [
        migrations.CreateModel(name='Location', fields=[
            ('id', models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name='ID')),
            ('name', models.CharField(max_length=160)), ('latitude', models.FloatField()), ('longitude', models.FloatField()),
            ('point', models.PointField(blank=True, geography=True, null=True, srid=4326)), ('geotag_comment', models.TextField(blank=True)),
            ('user', models.ForeignKey(blank=True, null=True, on_delete=django.db.models.deletion.SET_NULL, to=settings.AUTH_USER_MODEL)),
        ]),
        migrations.CreateModel(name='Route', fields=[
            ('route_id', models.BigAutoField(primary_key=True, serialize=False)), ('total_distance', models.FloatField(default=0)),
            ('total_time', models.FloatField(default=0)), ('accessibility_rating', models.FloatField(default=0)),
            ('geometry', models.LineStringField(blank=True, geography=True, null=True, srid=4326)),
            ('end_location', models.ForeignKey(on_delete=django.db.models.deletion.CASCADE, related_name='routes_to', to='backend.location')),
            ('start_location', models.ForeignKey(on_delete=django.db.models.deletion.CASCADE, related_name='routes_from', to='backend.location')),
        ]),
        migrations.CreateModel(name='AccessibilityFeature', fields=[
            ('feature_id', models.BigAutoField(primary_key=True, serialize=False)), ('feature_type', models.CharField(max_length=40)),
            ('description', models.TextField(blank=True)), ('is_step_free', models.BooleanField(default=False)),
            ('has_ramp', models.BooleanField(default=False)), ('slope_incline', models.FloatField(default=0)),
            ('location', models.ForeignKey(blank=True, null=True, on_delete=django.db.models.deletion.CASCADE, related_name='accessibility_features', to='backend.location')),
            ('route', models.ForeignKey(blank=True, null=True, on_delete=django.db.models.deletion.CASCADE, related_name='accessibility_features', to='backend.route')),
        ]),
    ]
