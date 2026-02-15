import { byId } from './dom.js';

export interface AppShellRefs {
  hostTabBtn: HTMLButtonElement;
  joinTabBtn: HTMLButtonElement;
  hostView: HTMLElement;
  joinView: HTMLElement;

  hostShare: HTMLElement;
  regenRoomBtn: HTMLButtonElement;
  openQrBtn: HTMLButtonElement;
  hostRoomCode: HTMLElement;
  hostBeat: HTMLElement;
  hostStatus: HTMLElement;
  hostBpmValue: HTMLElement;

  bpmDownBtn: HTMLButtonElement;
  bpmUpBtn: HTMLButtonElement;
  startBtn: HTMLButtonElement;
  stopBtn: HTMLButtonElement;

  joinEntry: HTMLElement;
  joinLive: HTMLElement;
  joinCodeLine: HTMLElement;
  joinCodeVisual: HTMLElement;
  joinCodeInput: HTMLInputElement;
  joinStatus: HTMLElement;
  joinLiveStatus: HTMLElement;
  joinBeat: HTMLElement;
  joinBpmValue: HTMLElement;

  qrModal: HTMLElement;
  qrNode: HTMLElement;
  closeQrBtn: HTMLButtonElement;
  appVersion: HTMLElement;
}

export function getAppShellRefs(): AppShellRefs {
  return {
    hostTabBtn: byId('hostTabBtn'),
    joinTabBtn: byId('joinTabBtn'),
    hostView: byId('hostView'),
    joinView: byId('joinView'),

    hostShare: byId('hostShare'),
    regenRoomBtn: byId('regenRoomBtn'),
    openQrBtn: byId('openQrBtn'),
    hostRoomCode: byId('hostRoomCode'),
    hostBeat: byId('hostBeat'),
    hostStatus: byId('hostStatus'),
    hostBpmValue: byId('hostBpmValue'),

    bpmDownBtn: byId('bpmDownBtn'),
    bpmUpBtn: byId('bpmUpBtn'),
    startBtn: byId('startBtn'),
    stopBtn: byId('stopBtn'),

    joinEntry: byId('joinEntry'),
    joinLive: byId('joinLive'),
    joinCodeLine: byId('joinCodeLine'),
    joinCodeVisual: byId('joinCodeVisual'),
    joinCodeInput: byId('joinCodeInput'),
    joinStatus: byId('joinStatus'),
    joinLiveStatus: byId('joinLiveStatus'),
    joinBeat: byId('joinBeat'),
    joinBpmValue: byId('joinBpmValue'),

    qrModal: byId('qrModal'),
    qrNode: byId('qrcode'),
    closeQrBtn: byId('closeQrBtn'),
    appVersion: byId('appVersion')
  };
}
