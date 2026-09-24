export interface RuntimeLifecycleHost {
  isActive?(): boolean;
  pause(): void;
  resume(): void;
  releaseInput(): void;
  resetWallTime(): void;
  showContinue(visible: boolean): void;
  unload?(): void;
}

/** Coordinates browser lifecycle events without disposing a BFCache-safe renderer. */
export class RuntimeLifecycle {
  private paused = false;
  private continueVisible = false;

  constructor(private readonly host: RuntimeLifecycleHost) {}

  isPaused(): boolean {
    return this.paused;
  }

  pause(): void {
    if (this.host.isActive && !this.host.isActive()) return;
    if (!this.paused) {
      this.paused = true;
      this.host.pause();
      this.host.releaseInput();
    }
    this.host.resetWallTime();
    if (!this.continueVisible) {
      this.continueVisible = true;
      this.host.showContinue(true);
    }
  }

  handleVisibility(hidden: boolean): void {
    if (hidden) this.pause();
    else if (this.paused && !this.continueVisible) {
      this.continueVisible = true;
      this.host.showContinue(true);
    }
  }

  handleBlur(): void {
    this.pause();
  }

  handlePageHide(persisted = true): void {
    if (persisted) this.pause();
    else {
      this.host.releaseInput();
      this.host.unload?.();
    }
  }

  handlePageShow(): void {
    if (this.paused && !this.continueVisible) {
      this.continueVisible = true;
      this.host.showContinue(true);
    }
  }

  continue(): void {
    if (!this.paused) return;
    this.paused = false;
    this.host.resume();
    this.host.resetWallTime();
    this.continueVisible = false;
    this.host.showContinue(false);
  }
}
