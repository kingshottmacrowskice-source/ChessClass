export const DEFAULT_BOARD_ANGLE = 58;
export const MIN_BOARD_ANGLE = 30;
export const MAX_BOARD_ANGLE = 90;
export const boardAngle = (value: unknown) =>
  typeof value === "number" && Number.isFinite(value)
    ? Math.max(MIN_BOARD_ANGLE, Math.min(MAX_BOARD_ANGLE, Math.round(value)))
    : DEFAULT_BOARD_ANGLE;

/** Visual offset in squares, toward White; logical square coordinates stay unchanged. */
export const PIECE_FORWARD_OFFSET = 1 / 6;
