import type { Sex } from './validation';

/** Baris dari view seats_public (tanpa edit_token_hash) */
export interface PublicSeat {
  id: string;
  category: number;
  gate: string;
  row_label: string;
  seat_number: number;
  nickname: string;
  sex: Sex;
  want_swap: boolean;
  x_username: string | null;
  ig_username: string | null;
  is_duplicate: boolean;
  created_at: string;
}

export const PUBLIC_COLUMNS =
  'id,category,gate,row_label,seat_number,nickname,sex,want_swap,x_username,ig_username,is_duplicate,created_at';
