/** Spatial layout of the room, in metres. Human scale throughout. */
import * as THREE from 'three';
import { MODULE_IDS } from '@/modules/ids';

export const CARD_W = 1.12;
export const CARD_H = 1.4;
export const RING_RADIUS = 3.45;
export const RING_Y = 1.52;
export const SLOT = (Math.PI * 2) / MODULE_IDS.length;

export const EYE = new THREE.Vector3(0, 1.6, 0.45);
export const LOOK = new THREE.Vector3(0, 1.5, -RING_RADIUS);
export const FOV = 45;

/** Where an opened card is read from: in front of the viewer, filling the view. */
export const READING_POS = new THREE.Vector3(-0.66, 1.56, -2.05);

/** Embodiment: the core point and the figure's base (sternum at y≈1.2). */
export const CORE = new THREE.Vector3(0, 1.48, -2.1);
export const FIGURE_ORIGIN = new THREE.Vector3(0, 0, -2.1);
export const EMBODIED_EYE = new THREE.Vector3(0, 1.54, -0.84);
export const EMBODIED_LOOK = new THREE.Vector3(0, 1.47, -2.1);
export const EMBODIED_FOV = 40;
