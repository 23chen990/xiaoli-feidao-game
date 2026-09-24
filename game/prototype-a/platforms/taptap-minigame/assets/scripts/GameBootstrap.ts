import { _decorator, Camera, Canvas, Color, Component, Graphics, input, Input, KeyCode, Layers, Node, ResolutionPolicy, screen, UITransform, view, type EventKeyboard } from 'cc';
import { createGameState, resolveContact, resolveFinish, tap } from './core/game-rules';
import { TAP_GAME } from './core/tap-config';

const { ccclass } = _decorator;
const DESIGN_WIDTH = 390;
const DESIGN_HEIGHT = 844;
const exactFitScreen = false;
const FIRST_FRAME_PALETTE = {
  background: new Color(7, 17, 38, 255), lane: new Color(31, 56, 86, 255),
  mint: new Color(99, 242, 213, 255), coral: new Color(244, 91, 118, 255),
  gold: new Color(247, 185, 76, 255), blade: new Color(229, 244, 251, 255),
};

@ccclass('GameBootstrap')
export class GameBootstrap extends Component {
  private state = createGameState();
  private staticGraphics?: Graphics;
  private dynamicGraphics?: Graphics;
  private distance = 0;
  private bladeY = -250;
  private bladeVy = 0;
  private bladeAngle = 0;
  private cutTriggered = false;
  private reflectTriggered = false;
  private hazardTriggered = false;
  private safeOffsetY = 0;
  private idlePhase = 0;

  start(): void {
    void exactFitScreen;
    view.setDesignResolutionSize(DESIGN_WIDTH, DESIGN_HEIGHT, ResolutionPolicy.FIXED_WIDTH);
    const safeArea = screen.safeArea;
    this.safeOffsetY = Math.max(0, (screen.windowSize.height - safeArea.height) / 2);
    this.buildPlatformSafeCanvas();
    this.redrawStaticCourse();
    this.redrawDynamicCourse();
    input.on(Input.EventType.TOUCH_END, this.onTap, this);
    input.on(Input.EventType.MOUSE_UP, this.onTap, this);
    input.on(Input.EventType.KEY_DOWN, this.onKeyDown, this);
    console.log(`[${TAP_GAME.name}] TapTap ${TAP_GAME.appId} portrait Graphics runtime ready`);
  }

  update(deltaTime: number): void {
    const dt = Math.min(0.05, Math.max(0, deltaTime));
    if (this.state.status !== 'airborne') {
      // Idle presentation contract: the TapTap performance sampler counts
      // visible screen changes, so a waiting surface must keep presenting a
      // live frame every vsync. The static course layer stays untouched
      // (one draw per lifecycle); only the dynamic layer animates.
      this.idlePhase += dt * 2.2;
      this.bladeY = -250 + Math.sin(this.idlePhase) * 14;
      this.bladeAngle = Math.sin(this.idlePhase * 0.8) * 0.22;
      this.redrawDynamicCourse();
      return;
    }
    this.distance += Math.max(80, Math.abs(this.state.motion.vx)) * dt;
    this.bladeVy += 164 * dt;
    this.bladeY -= this.bladeVy * dt;
    this.bladeAngle += this.state.motion.angularVelocity * dt;
    if (!this.cutTriggered && this.distance >= 85) {
      this.cutTriggered = true;
      this.state = resolveContact(this.state, 'sharp', 'moon-fruit-1');
    }
    if (!this.reflectTriggered && this.distance >= 180 && this.bladeY < -170) {
      this.reflectTriggered = true;
      this.state = resolveContact(this.state, 'blunt', 'stone-1');
      this.bladeVy = -92;
    }
    if (!this.hazardTriggered && this.distance >= 300 && this.bladeY < -320) {
      this.hazardTriggered = true;
      this.state = resolveContact(this.state, 'hazard', 'spikes');
    } else if (this.bladeY < -390) {
      this.state = resolveContact(this.state, 'fall');
    } else if (this.distance >= 520) {
      this.state = resolveFinish(this.state);
    }
    this.redrawDynamicCourse();
  }

  onDestroy(): void {
    input.off(Input.EventType.TOUCH_END, this.onTap, this);
    input.off(Input.EventType.MOUSE_UP, this.onTap, this);
    input.off(Input.EventType.KEY_DOWN, this.onKeyDown, this);
  }

  private buildPlatformSafeCanvas(): void {
    this.node.layer = Layers.Enum.UI_2D;
    const transform = this.node.getComponent(UITransform) ?? this.node.addComponent(UITransform);
    transform.setContentSize(DESIGN_WIDTH, DESIGN_HEIGHT);
    const cameraNode = new Node('Portrait UI Camera');
    cameraNode.layer = Layers.Enum.UI_2D;
    cameraNode.setPosition(0, 0, 1000);
    const camera = cameraNode.addComponent(Camera);
    camera.projection = Camera.ProjectionType.ORTHO;
    camera.orthoHeight = DESIGN_HEIGHT / 2;
    camera.visibility = Layers.Enum.UI_2D;
    camera.clearColor = FIRST_FRAME_PALETTE.background;
    this.node.scene?.addChild(cameraNode);
    const canvas = this.node.getComponent(Canvas) ?? this.node.addComponent(Canvas);
    canvas.cameraComponent = camera;
    this.staticGraphics = this.createGraphicsLayer('Static Course');
    this.dynamicGraphics = this.createGraphicsLayer('Dynamic Blade And Feedback');
  }

  private createGraphicsLayer(name: string): Graphics {
    const layer = new Node(name);
    layer.layer = Layers.Enum.UI_2D;
    layer.addComponent(UITransform).setContentSize(DESIGN_WIDTH, DESIGN_HEIGHT);
    this.node.addChild(layer);
    return layer.addComponent(Graphics);
  }

  private drawFirstFrameBackground(graphics: Graphics): void {
    graphics.fillColor = FIRST_FRAME_PALETTE.background;
    graphics.rect(-DESIGN_WIDTH / 2, -DESIGN_HEIGHT / 2, DESIGN_WIDTH, DESIGN_HEIGHT);
    graphics.fill();
    graphics.fillColor = FIRST_FRAME_PALETTE.lane;
    graphics.roundRect(-168, -355, 336, 650, 26);
    graphics.fill();
    graphics.strokeColor = new Color(52, 88, 126, 255);
    graphics.lineWidth = 4;
    graphics.moveTo(0, -335); graphics.lineTo(0, 272); graphics.stroke();
  }

  private redrawStaticCourse(): void {
    const graphics = this.staticGraphics;
    if (!graphics) return;
    graphics.clear();
    this.drawFirstFrameBackground(graphics);
    this.fillRect(graphics, -170, -365, 340, 28, new Color(127, 202, 104, 255));
    this.fillRect(graphics, 94, -185, 45, 142, new Color(82, 109, 128, 255));
    graphics.fillColor = new Color(232, 162, 72, 255); graphics.circle(-45, 28, 30); graphics.fill();
    for (let x = -150; x <= 150; x += 38) {
      graphics.fillColor = FIRST_FRAME_PALETTE.coral;
      graphics.moveTo(x - 17, -335); graphics.lineTo(x, -297); graphics.lineTo(x + 17, -335); graphics.close(); graphics.fill();
    }
    this.fillRect(graphics, -126, 250, 30, 116, FIRST_FRAME_PALETTE.mint);
    this.fillRect(graphics, 96, 250, 30, 116, FIRST_FRAME_PALETTE.gold);
    this.fillRect(graphics, -126, 340, 252, 24, new Color(79, 141, 232, 255));
  }

  private redrawDynamicCourse(): void {
    const graphics = this.dynamicGraphics;
    if (!graphics) return;
    graphics.clear();
    const feedback = this.state.status === 'failed' ? FIRST_FRAME_PALETTE.coral
      : this.state.status === 'won' ? FIRST_FRAME_PALETTE.mint
        : this.state.lastFeedback === 'cut' ? new Color(150, 255, 233, 255) : new Color(255, 226, 146, 255);
    this.fillRect(graphics, -145, 300 - this.safeOffsetY, 290, 12, feedback);
    this.drawBlade(graphics);
  }

  private drawBlade(graphics: Graphics): void {
    const cx = -45; const cy = this.bladeY; const cos = Math.cos(this.bladeAngle); const sin = Math.sin(this.bladeAngle);
    const point = (x: number, y: number): [number, number] => [cx + x * cos - y * sin, cy + x * sin + y * cos];
    const points = [point(-62, -8), point(68, -8), point(82, 0), point(68, 8), point(-62, 8)];
    graphics.fillColor = FIRST_FRAME_PALETTE.blade;
    graphics.moveTo(points[0][0], points[0][1]);
    for (let i = 1; i < points.length; i += 1) graphics.lineTo(points[i][0], points[i][1]);
    graphics.close(); graphics.fill();
    this.fillRect(graphics, cx - 92, cy - 16, 34, 32, new Color(229, 95, 56, 255));
  }

  private fillRect(graphics: Graphics, x: number, y: number, width: number, height: number, color: Color): void {
    graphics.fillColor = color;
    graphics.roundRect(x, y, width, height, Math.min(10, width / 4, height / 4));
    graphics.fill();
  }

  private applyTap(): void {
    const terminal = this.state.status === 'failed' || this.state.status === 'won';
    this.state = tap(this.state);
    if (terminal) {
      this.distance = 0; this.bladeY = -250; this.bladeAngle = 0;
      this.cutTriggered = false; this.reflectTriggered = false; this.hazardTriggered = false;
    } else {
      this.bladeVy = -102;
    }
    this.redrawDynamicCourse();
  }

  private onTap(): void { this.applyTap(); }
  private onKeyDown(event: EventKeyboard): void {
    if (event.keyCode === KeyCode.SPACE || event.keyCode === KeyCode.ENTER) this.applyTap();
  }
}
