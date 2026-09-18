export type Mode = 'cv' | 'names';
export type ItemStatus = 'ok' | 'warn' | 'err';

export interface Frame {
  name: string;
  is_label: boolean;
  suffix_custom: string | null;
  /** hash файла для GET /preview/{hash} */
  preview: string | null;
  size: number;
}

export interface Item {
  id: string;
  barcode: string | null;
  lm_code: string | null;
  product_name: string | null;
  frames: Frame[];
  status: ItemStatus;
  is_new: boolean;
  /** cv:zxing | cv:opencv | names | marker | manual | orphan */
  source: string;
  lookup_source: string | null;
  excel_row: number | null;
  has_label: boolean;
}

export interface SessionData {
  folder: string | null;
  mode: Mode;
  zayavka: string | null;
  items: Item[];
}

export type PlanKind = 'label' | 'main' | 'angle';

export interface PlanRow {
  src: string;
  dst: string;
  kind: PlanKind;
  item_id: string;
}

export interface SystemInfo {
  version: string;
  port: number;
  data_dir: string;
  cache_count: number;
  engines: { opencv: boolean; zxing: boolean; pyzbar: boolean };
  apim: { env: 'preprod' | 'prod'; enabled: boolean };
}
