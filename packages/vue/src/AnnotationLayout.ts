export interface AnnotationPoint {
  readonly x: number;
  readonly y: number;
}

export interface AnnotationViewport {
  readonly width: number;
  readonly height: number;
  readonly controlsHeight: number;
}

export interface AnnotationSize {
  readonly width: number;
  readonly height: number;
}

export interface AnnotationMarker extends AnnotationPoint {
  readonly displaced: boolean;
}

export interface AnnotationTooltipLayout {
  readonly left: number;
  readonly top: number;
  readonly maxHeight: number;
}

/** Pure layout calculations. Points are normalized; dimensions and offsets are pixels. */
export class AnnotationLayout {
  private static readonly markerRadius = 20;
  private static readonly controlsGap = 8;
  private static readonly cardInset = 12;

  static marker(point: AnnotationPoint, viewport: AnnotationViewport): AnnotationMarker {
    const width = this.dimension(viewport.width);
    const height = this.dimension(viewport.height);
    const controlsHeight = this.dimension(viewport.controlsHeight);
    const source = this.pixels(point, width, height);
    const insetX = Math.min(this.markerRadius, width / 2);
    const insetY = Math.min(this.markerRadius, height / 2);
    const bottom = Math.max(insetY, height - controlsHeight - this.controlsGap - insetY);
    const x = this.clamp(source.x, insetX, width - insetX);
    const y = this.clamp(source.y, insetY, bottom);

    return {
      x: width > 0 ? x / width : 0.5,
      y: height > 0 ? y / height : 0.5,
      displaced: Math.hypot(x - source.x, y - source.y) > 1,
    };
  }

  static tooltip(
    anchor: AnnotationPoint,
    viewport: AnnotationViewport,
    size: AnnotationSize,
    markers: readonly AnnotationPoint[],
  ): AnnotationTooltipLayout {
    const width = this.dimension(viewport.width);
    const height = this.dimension(viewport.height);
    const availableHeight = Math.max(
      0,
      height - this.dimension(viewport.controlsHeight) - this.controlsGap,
    );
    const insetX = Math.min(this.cardInset, width / 2);
    const insetY = Math.min(this.cardInset, availableHeight / 2);
    const maxHeight = Math.max(0, availableHeight - insetY * 2);
    const cardWidth = Math.min(this.dimension(size.width), Math.max(0, width - insetX * 2));
    const cardHeight = Math.min(this.dimension(size.height), maxHeight);
    const right = Math.max(insetX, width - insetX - cardWidth);
    const bottom = Math.max(insetY, availableHeight - insetY - cardHeight);
    const point = this.pixels(anchor, width, height);
    const gap = this.markerRadius + this.controlsGap;
    const candidates: AnnotationPoint[] = [
      { x: point.x - cardWidth / 2, y: point.y + gap },
      { x: point.x - cardWidth / 2, y: point.y - gap - cardHeight },
      { x: point.x - gap - cardWidth, y: point.y - cardHeight / 2 },
      { x: point.x + gap, y: point.y - cardHeight / 2 },
      // Corners can remain usable when neighboring markers block every side.
      { x: insetX, y: insetY },
      { x: right, y: insetY },
      { x: insetX, y: bottom },
      { x: right, y: bottom },
    ];
    const obstacles = markers.map((marker) => this.pixels(marker, width, height));
    if (!obstacles.some((marker) => marker.x === point.x && marker.y === point.y)) {
      obstacles.push(point);
    }

    let placement = { left: insetX, top: insetY, maxHeight };
    let smallestOverlap = Number.POSITIVE_INFINITY;

    for (const candidate of candidates) {
      const left = this.clamp(candidate.x, insetX, right);
      const top = this.clamp(candidate.y, insetY, bottom);
      const overlap = obstacles.reduce(
        (total, marker) => total + this.overlap(left, top, cardWidth, cardHeight, marker),
        0,
      );
      if (overlap < smallestOverlap) {
        placement = { left, top, maxHeight };
        smallestOverlap = overlap;
      }
      // Preserve the preferred side as soon as it leaves every marker accessible.
      if (overlap === 0) break;
    }

    return placement;
  }

  private static overlap(
    left: number,
    top: number,
    width: number,
    height: number,
    marker: AnnotationPoint,
  ): number {
    const intersectionWidth = Math.max(
      0,
      Math.min(left + width, marker.x + this.markerRadius) -
        Math.max(left, marker.x - this.markerRadius),
    );
    const intersectionHeight = Math.max(
      0,
      Math.min(top + height, marker.y + this.markerRadius) -
        Math.max(top, marker.y - this.markerRadius),
    );
    return intersectionWidth * intersectionHeight;
  }

  private static pixels(point: AnnotationPoint, width: number, height: number): AnnotationPoint {
    return {
      x: this.clamp(Number.isFinite(point.x) ? point.x : 0.5, 0, 1) * width,
      y: this.clamp(Number.isFinite(point.y) ? point.y : 0.5, 0, 1) * height,
    };
  }

  private static dimension(value: number): number {
    return Number.isFinite(value) ? this.clamp(value, 0, Number.MAX_SAFE_INTEGER) : 0;
  }

  private static clamp(value: number, minimum: number, maximum: number): number {
    return Math.min(maximum, Math.max(minimum, value));
  }
}
