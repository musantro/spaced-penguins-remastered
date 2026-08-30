export interface Point { x: number; y: number }

export interface AssetMember {
  id: string;
  cast: string;
  number: number;
  type: string;
  name: string;
  registrationPoint: Point;
  files: string[];
  image: string | null;
  audio: string | null;
  text: { html: string | null; plain: string | null } | null;
}

export interface ScoreSprite {
  target: string;
  movieFrame: number;
  frameLabel: string | null;
  channel: number;
  castLibNum: number;
  memberNum: number;
  memberName: string;
  memberType: string;
  locH: number;
  locV: number;
  width: number;
  height: number;
  rotation: number;
  skew: number;
  blend: number;
  visible: boolean;
  ink: number;
  rectLeft: number;
  rectTop: number;
  rectRight: number;
  rectBottom: number;
  foreColor: string;
  backColor: string;
  scriptList: string;
  cast: string;
}

export interface ScoreFrame { movieFrame: number; frameLabel: string | null; sprites: ScoreSprite[] }

export interface Content {
  assets: Map<string, AssetMember>;
  frames: Map<number, ScoreFrame>;
  screens: Record<string, string>;
}
