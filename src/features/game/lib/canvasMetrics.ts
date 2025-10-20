// src/features/game/lib/canvasMetrics.ts
// Shared helpers to derive pixel metrics from grid dimensions.

import { GRID_DIMENSIONS } from '@/features/game/config';

export const calculateCanvasSize = (gridSize: number) =>
  GRID_DIMENSIONS.baseCellSize *
  (GRID_DIMENSIONS.baseGridSize +
    GRID_DIMENSIONS.visualScaleFactor * (gridSize - GRID_DIMENSIONS.baseGridSize));

export const calculateCellSize = (gridSize: number) => calculateCanvasSize(gridSize) / gridSize;

