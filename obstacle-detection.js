/* Real-time camera obstacle detection using TensorFlow.js and COCO-SSD. */
(function () {
  const OBSTACLE_CLASSES = new Set([
    'person', 'bicycle', 'car', 'motorcycle', 'bus', 'truck'
  ]);
  const MIN_BOX_AREA_RATIO = 0.15;
  const ALERT_COOLDOWN_MS = 4000;
  const DEFAULTS = {
    scoreThreshold: 0.68,
    nearAreaRatio: 0.15,
    centralPathWidth: 0.42,
    detectionIntervalMs: 180
  };

  class ObstacleDetection {
    constructor(options = {}) {
      this.options = { ...DEFAULTS, ...options };
      this.video = null;
      this.model = null;
      this.animationFrame = null;
      this.lastDetectionAt = 0;
      this.lastAlertAt = 0;
      this.lastState = 'loading';
      this.running = false;
      this.loading = false;
      this.canvas = document.createElement('canvas');
      this.canvas.className = 'obstacle-detection-canvas';
      this.canvas.setAttribute('aria-hidden', 'true');
      this.context = this.canvas.getContext('2d');
      this.overlay = document.getElementById('obstacle-guidance-overlay');
      this.status = document.getElementById('obstacle-guidance-status');
      this.detail = document.getElementById('obstacle-guidance-detail');
      this.zones = document.getElementById('obstacle-zones');
    }

    async start(videoElement) {
      if (this.running || this.loading) return;
      this.video = videoElement;
      if (!this.video || !window.cocoSsd) {
        this.setStatus('Obstacle detection unavailable', 'Load the detection model to enable path guidance.', 'unavailable');
        return;
      }

      this.loading = true;
      this.setStatus('Loading obstacle detection', 'Preparing the camera model...', 'loading');
      try {
        this.model = await window.cocoSsd.load({ base: 'lite_mobilenet_v2' });
        this.running = true;
        this.loading = false;
        this.syncCanvasSize();
        window.addEventListener('resize', this.syncCanvasSize);
        this.setStatus('Path Clear - Continue Walking', 'Scanning the central path', 'clear');
        this.detectFrame();
      } catch (error) {
        this.loading = false;
        this.setStatus('Obstacle detection unavailable', 'The model could not be loaded. Camera guidance is still available.', 'unavailable');
        console.error('COCO-SSD failed to load:', error);
      }
    }

    stop() {
      this.running = false;
      this.loading = false;
      if (this.animationFrame) cancelAnimationFrame(this.animationFrame);
      this.animationFrame = null;
      window.removeEventListener('resize', this.syncCanvasSize);
      this.clearCanvas();
      this.setStatus('Obstacle detection paused', 'Camera guidance remains available.', 'paused');
    }

    syncCanvasSize = () => {
      if (!this.video) return;
      const width = this.video.clientWidth || this.video.videoWidth || 1;
      const height = this.video.clientHeight || this.video.videoHeight || 1;
      this.canvas.width = width;
      this.canvas.height = height;
      if (this.canvas.parentElement !== this.video.parentElement) {
        this.video.parentElement?.appendChild(this.canvas);
      }
    };

    detectFrame = async () => {
      if (!this.running || !this.model || !this.video) return;
      this.animationFrame = requestAnimationFrame(this.detectFrame);
      if (this.video.readyState < HTMLMediaElement.HAVE_CURRENT_DATA) return;
      const now = performance.now();
      if (now - this.lastDetectionAt < this.options.detectionIntervalMs) return;
      this.lastDetectionAt = now;

      try {
        const predictions = await this.model.detect(this.video);
        if (this.running) this.renderGuidance(predictions);
      } catch (error) {
        console.warn('Obstacle detection frame failed:', error);
      }
    };

    renderGuidance(predictions) {
      this.syncCanvasSize();
      this.clearCanvas();
      const width = this.video.videoWidth || this.canvas.width;
      const height = this.video.videoHeight || this.canvas.height;
      const scaleX = this.canvas.width / width;
      const scaleY = this.canvas.height / height;
      const totalArea = width * height;
      const obstacles = predictions
        .filter((prediction) => {
          if (!OBSTACLE_CLASSES.has(prediction.class) || prediction.score < this.options.scoreThreshold) return false;
          const [, , boxWidth, boxHeight] = prediction.bbox;
          return (boxWidth * boxHeight) / totalArea >= MIN_BOX_AREA_RATIO;
        })
        .map((prediction) => this.describe(prediction, width, height));

      obstacles.forEach((obstacle) => this.drawObstacle(obstacle, scaleX, scaleY));
      const central = obstacles.filter((obstacle) => obstacle.zone === 'center');
      const nearCentral = central.filter((obstacle) => obstacle.near);
      const state = nearCentral.length ? 'stop' : central.length ? 'caution' : 'clear';
      const cue = this.getCue(state, obstacles);
      this.setStatus(cue.text, cue.detail, state);
      this.announceCue(cue, state);
    }

    describe(prediction, width, height) {
      const [x, y, boxWidth, boxHeight] = prediction.bbox;
      const center = x + boxWidth / 2;
      const centralStart = width * (1 - this.options.centralPathWidth) / 2;
      const centralEnd = width - centralStart;
      const zone = center < centralStart ? 'left' : center > centralEnd ? 'right' : 'center';
      const areaRatio = (boxWidth * boxHeight) / (width * height);
      return { ...prediction, x, y, boxWidth, boxHeight, zone, near: areaRatio >= this.options.nearAreaRatio || boxHeight / height >= 0.42 };
    }

    getCue(state, obstacles) {
      if (state === 'stop') return { text: 'Obstacle Ahead - Stop and Reroute', detail: 'A nearby obstacle is blocking the center path.', speech: 'Obstacle detected ahead. Stop and reroute.' };
      if (state === 'caution') return { text: 'Obstacle Ahead - Proceed Carefully', detail: 'The central path has an obstacle.', speech: 'Obstacle detected ahead. Proceed carefully.' };
      const leftBlocked = obstacles.some((obstacle) => obstacle.zone === 'left' && obstacle.near);
      const rightBlocked = obstacles.some((obstacle) => obstacle.zone === 'right' && obstacle.near);
      if (leftBlocked && !rightBlocked) return { text: 'Obstacle Left - Shift Right', detail: 'The right zone is currently clear.', speech: 'Obstacle on the left. Shift right.' };
      if (rightBlocked && !leftBlocked) return { text: 'Obstacle Right - Shift Left', detail: 'The left zone is currently clear.', speech: 'Obstacle on the right. Shift left.' };
      return { text: 'Path Clear - Continue Walking', detail: 'No likely obstacle is blocking your path.', speech: 'Path clear. Continue walking.' };
    }

    announceCue(cue, state) {
      const now = Date.now();
      const changed = state !== this.lastState;
      if (now - this.lastAlertAt >= ALERT_COOLDOWN_MS && typeof window.speakCue === 'function') {
        if (window.speechSynthesis && typeof window.speechSynthesis.cancel === 'function') {
          window.speechSynthesis.cancel();
        }
        window.speakCue(cue.speech);
        if (navigator.vibrate) navigator.vibrate(120);
        this.lastAlertAt = now;
      }
      if (changed && typeof window.announceForA11y === 'function') window.announceForA11y(cue.text);
      this.lastState = state;
    }

    setStatus(text, detail, state) {
      if (this.overlay) this.overlay.dataset.state = state;
      if (this.status) this.status.textContent = text;
      if (this.detail) this.detail.textContent = detail;
      if (this.zones) this.zones.setAttribute('aria-label', `Obstacle zones: ${state}`);
    }

    drawObstacle(obstacle, scaleX, scaleY) {
      const x = obstacle.x * scaleX;
      const y = obstacle.y * scaleY;
      const boxWidth = obstacle.boxWidth * scaleX;
      const boxHeight = obstacle.boxHeight * scaleY;
      const color = obstacle.zone === 'center' ? (obstacle.near ? '#ff5d52' : '#ffd166') : '#6ee7b7';
      this.context.strokeStyle = color;
      this.context.lineWidth = 3;
      this.context.strokeRect(x, y, boxWidth, boxHeight);
      this.context.fillStyle = color;
      this.context.font = '600 12px sans-serif';
      this.context.fillText(`${obstacle.class} ${Math.round(obstacle.score * 100)}%`, x + 4, Math.max(14, y - 5));
    }

    clearCanvas() {
      if (this.context) this.context.clearRect(0, 0, this.canvas.width, this.canvas.height);
    }
  }

  window.ObstacleDetection = ObstacleDetection;
})();
