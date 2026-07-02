// Client<->server command/event protocol. Messages are PLAIN typed payloads (never Colyseus
// Schema) sent via room.send(code, payload). Authored now, live in v4.

import type { Axis2 } from "../types/input";
import type { WantedLevel } from "../types/entities";

export enum ClientMessage {
  Input = "in",
  Interact = "int",
  Fire = "fire",
  SwitchWeapon = "sw",
  Chat = "chat",
  Respawn = "resp",
}

export enum ServerMessage {
  Hit = "hit",
  Kill = "kill",
  Spawn = "spawn",
  Despawn = "desp",
  Sound = "snd",
  WantedChanged = "wl",
  MissionEvent = "me",
  Chat = "cmsg",
  ServerError = "err",
}

export interface InputCommand {
  seq: number;
  dt: number;
  move: Axis2;
  lookYaw: number;
  lookPitch: number;
  buttons: number; // bitmask of shared Button enum
}

export interface InteractCommand {
  targetNetId?: number;
}

export interface FireCommand {
  origin: [number, number, number];
  dir: [number, number, number];
  weapon: string;
  seq: number;
}

export interface ChatCommand {
  text: string;
}

export interface HitEvent {
  targetNetId: number;
  byNetId: number;
  damage: number;
}

export interface SpawnEvent {
  netId: number;
  kind: string;
}

export interface WantedChangedEvent {
  netId: number;
  level: WantedLevel;
}

export interface ChatEvent {
  fromNetId: number;
  name: string;
  text: string;
}

export interface ServerErrorEvent {
  code: string;
  message: string;
}

/** Payload type for each client->server message code. */
export type ClientPayloads = {
  [ClientMessage.Input]: InputCommand;
  [ClientMessage.Interact]: InteractCommand;
  [ClientMessage.Fire]: FireCommand;
  [ClientMessage.SwitchWeapon]: { weapon: string };
  [ClientMessage.Chat]: ChatCommand;
  [ClientMessage.Respawn]: Record<string, never>;
};

/** Payload type for each server->client message code. */
export type ServerPayloads = {
  [ServerMessage.Hit]: HitEvent;
  [ServerMessage.Kill]: HitEvent;
  [ServerMessage.Spawn]: SpawnEvent;
  [ServerMessage.Despawn]: { netId: number };
  [ServerMessage.Sound]: { sound: string; x: number; y: number; z: number };
  [ServerMessage.WantedChanged]: WantedChangedEvent;
  [ServerMessage.MissionEvent]: { mission: string; event: string };
  [ServerMessage.Chat]: ChatEvent;
  [ServerMessage.ServerError]: ServerErrorEvent;
};
