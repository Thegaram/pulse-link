import type { TransportRuntime } from '../../realtime/runtime.js';
import { HostController } from './host-controller.js';
import { JoinController } from './join-controller.js';
import { TimerLifecycle } from './timer-lifecycle.js';
import type { ControllerCallbacks } from './controller-types.js';
export type { BackendState, ControllerCallbacks } from './controller-types.js';

export class AppWorkflowController {
  private readonly timers = new TimerLifecycle();
  private readonly hostController: HostController;
  private readonly joinController: JoinController;

  constructor(transportRuntime: TransportRuntime, cb: ControllerCallbacks) {
    this.hostController = new HostController(transportRuntime, cb, this.timers);
    this.joinController = new JoinController(transportRuntime, cb, this.timers);
  }

  onBpmPointerDown(delta: number, event: PointerEvent): void {
    this.hostController.onBpmPointerDown(delta, event);
  }

  onBpmClick(delta: number, event: MouseEvent): void {
    this.hostController.onBpmClick(delta, event);
  }

  stopBpmHold(): void {
    this.hostController.stopBpmHold();
  }

  queueRunningBpmUpdate(apply: () => void): void {
    this.hostController.queueRunningBpmUpdate(apply);
  }

  async ensureHostRoom(forceNewCode = false): Promise<void> {
    await this.hostController.ensureHostRoom(forceNewCode);
  }

  async regenerateHostRoom(): Promise<void> {
    await this.hostController.regenerateHostRoom();
  }

  async teardownHost(): Promise<void> {
    await this.hostController.teardownHost();
  }

  async teardownPeer(): Promise<void> {
    await this.joinController.teardownPeer();
  }

  async switchToHost(): Promise<void> {
    await this.joinController.teardownPeer();
    await this.hostController.ensureHostRoom();
  }

  async switchToJoin(): Promise<void> {
    await this.hostController.teardownHost();
    this.joinController.prepareJoinMode();
  }

  async joinRoom(roomId: string): Promise<void> {
    await this.joinController.joinRoom(roomId);
  }

  maybeAutoJoin(): void {
    this.joinController.maybeAutoJoin();
  }

  startHostMetronome(): void {
    this.hostController.startHostMetronome();
  }

  stopHostMetronome(): void {
    this.hostController.stopHostMetronome();
  }

  destroy(): void {
    this.timers.destroy();
    void this.joinController.teardownPeer();
    void this.hostController.teardownHost();
  }
}
