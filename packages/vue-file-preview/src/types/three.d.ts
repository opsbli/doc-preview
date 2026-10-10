declare module 'three-dxf-loader' {
  export class DXFLoader {
    constructor();
    load(
      url: string,
      onLoad: (object: any) => void,
      onProgress?: (event: ProgressEvent) => void,
      onError?: (error: Error) => void
    ): void;
  }
}

declare module 'three/examples/jsm/controls/OrbitControls' {
  import { Camera, EventDispatcher, MOUSE, TOUCH, Vector3 } from 'three';
  export class OrbitControls extends EventDispatcher {
    constructor(object: Camera, domElement?: HTMLElement);
    object: Camera;
    domElement: HTMLElement | Document;
    enabled: boolean;
    target: Vector3;
    enableDamping: boolean;
    dampingFactor: number;
    enableZoom: boolean;
    zoomSpeed: number;
    enableRotate: boolean;
    rotateSpeed: number;
    enablePan: boolean;
    panSpeed: number;
    screenSpacePanning: boolean;
    keyPanSpeed: number;
    autoRotate: boolean;
    autoRotateSpeed: number;
    minDistance: number;
    maxDistance: number;
    minZoom: number;
    maxZoom: number;
    minPolarAngle: number;
    maxPolarAngle: number;
    minAzimuthAngle: number;
    maxAzimuthAngle: number;
    enableKeys: boolean;
    keys: { LEFT: number; UP: number; RIGHT: number; BOTTOM: number };
    mouseButtons: { LEFT: MOUSE; MIDDLE: MOUSE; RIGHT: MOUSE };
    touches: { ONE: TOUCH; TWO: TOUCH };
    update(): boolean;
    saveState(): void;
    reset(): void;
    dispose(): void;
    getPolarAngle(): number;
    getAzimuthalAngle(): number;
    getDistance(): number;
    listenToKeyEvents(domElement: HTMLElement): void;
  }
}

declare module 'three/examples/jsm/loaders/STLLoader' {
  import { BufferGeometry, Loader, LoadingManager } from 'three';
  export class STLLoader extends Loader {
    constructor(manager?: LoadingManager);
    load(
      url: string,
      onLoad: (geometry: BufferGeometry) => void,
      onProgress?: (event: ProgressEvent) => void,
      onError?: (error: Error) => void
    ): void;
    parse(data: ArrayBuffer | string): BufferGeometry;
  }
}

declare module 'three/examples/jsm/loaders/OBJLoader' {
  import { Group, Loader, LoadingManager } from 'three';
  export class OBJLoader extends Loader {
    constructor(manager?: LoadingManager);
    load(
      url: string,
      onLoad: (group: Group) => void,
      onProgress?: (event: ProgressEvent) => void,
      onError?: (error: Error) => void
    ): void;
    parse(text: string): Group;
    setMaterials(materials: any): this;
  }
}

declare module 'three/examples/jsm/loaders/GLTFLoader' {
  import { Loader, LoadingManager, Scene, AnimationClip, Camera } from 'three';

  export interface GLTF {
    scene: Scene;
    scenes: Scene[];
    cameras: Camera[];
    animations: AnimationClip[];
    asset: {
      copyright?: string;
      generator?: string;
      version?: string;
      minVersion?: string;
      extensions?: any;
      extras?: any;
    };
    parser: any;
    userData: any;
  }

  export class GLTFLoader extends Loader {
    constructor(manager?: LoadingManager);
    load(
      url: string,
      onLoad: (gltf: GLTF) => void,
      onProgress?: (event: ProgressEvent) => void,
      onError?: (error: Error) => void
    ): void;
    parse(
      data: ArrayBuffer | string,
      path: string,
      onLoad: (gltf: GLTF) => void,
      onError?: (error: Error) => void
    ): void;
    setDRACOLoader(dracoLoader: any): this;
    setKTX2Loader(ktx2Loader: any): this;
    setMeshoptDecoder(meshoptDecoder: any): this;
  }
}
declare module 'three/examples/jsm/loaders/PLYLoader' {
  import { BufferGeometry, Loader, LoadingManager } from 'three';
  export class PLYLoader extends Loader {
    constructor(manager?: LoadingManager);
    parse(data: ArrayBuffer | string): BufferGeometry;
  }
}

declare module 'three/examples/jsm/loaders/FBXLoader' {
  import { Group, Loader, LoadingManager } from 'three';
  export class FBXLoader extends Loader {
    constructor(manager?: LoadingManager);
    parse(data: ArrayBuffer | string, path: string): Group;
  }
}

declare module 'three/examples/jsm/loaders/ColladaLoader' {
  import { Loader, LoadingManager, Scene } from 'three';
  export interface Collada {
    scene: Scene;
    kinematics: unknown;
    library: unknown;
    animations: unknown[];
  }
  export class ColladaLoader extends Loader {
    constructor(manager?: LoadingManager);
    parse(text: string, path: string): Collada;
  }
}

declare module 'three/examples/jsm/loaders/3MFLoader' {
  import { Group, Loader, LoadingManager } from 'three';
  export class ThreeMFLoader extends Loader {
    constructor(manager?: LoadingManager);
    parse(data: ArrayBuffer | string): Group;
  }
}

declare module 'three/examples/jsm/loaders/AMFLoader' {
  import { Group, Loader, LoadingManager } from 'three';
  export class AMFLoader extends Loader {
    constructor(manager?: LoadingManager);
    parse(data: ArrayBuffer | string): Group;
  }
}

declare module 'three/examples/jsm/loaders/VRMLLoader' {
  import { Group, Loader, LoadingManager } from 'three';
  export class VRMLLoader extends Loader {
    constructor(manager?: LoadingManager);
    parse(text: string): Group;
  }
}
