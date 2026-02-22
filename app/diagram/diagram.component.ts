import {
  Component,
  Input,
  AfterViewInit,
  ViewChild,
  ElementRef,
  HostListener,
  ChangeDetectionStrategy,
  ChangeDetectorRef,
} from "@angular/core";
import { CommonModule } from "@angular/common";

// ── Публичные интерфейсы ───────────────────────────────────────

export interface DiagramNode {
  id: number;
  label: string;
  wx?: number; // начальная мировая X (если не задана — авторасстановка)
  wy?: number; // начальная мировая Y
}

export interface DiagramEdge {
  from: number; // id узла-источника
  to: number;   // id узла-цели
}

// ── Внутренние типы ────────────────────────────────────────────

interface INode {
  id: number;
  label: string;
  wx: number;
  wy: number;
}

interface IEdge {
  id: string;
  path: string;
}

// ── Константы ─────────────────────────────────────────────────

const NODE_W    = 120; // должно совпадать с CSS .diagram-node { width }
const NODE_H    = 40;  // должно совпадать с CSS .diagram-node { height }
const MIN_ZOOM  = 0.2;
const MAX_ZOOM  = 3;
const ZOOM_STEP = 0.15;

function circlePositions(n: number, cx: number, cy: number, r: number) {
  return Array.from({ length: n }, (_, i) => ({
    wx: cx + r * Math.cos((2 * Math.PI * i) / n - Math.PI / 2),
    wy: cy + r * Math.sin((2 * Math.PI * i) / n - Math.PI / 2),
  }));
}

@Component({
  selector: "app-diagram",
standalone: true,
  imports: [CommonModule],
  templateUrl: "./diagram.component.html",
styleUrl: "./diagram.component.scss",
changeDetection: ChangeDetectionStrategy.OnPush,
})
export class DiagramComponent implements AfterViewInit {

// ── Входные данные ─────────────────────────────────────────
  @Input() set nodes(value: DiagramNode[]) {
    this._inputNodes = value;
    this.initNodes();
    this.render();
  }

  @Input() set edges(value: DiagramEdge[]) {
    this._inputEdges = value;
    this.render();
  }

  private _inputNodes: DiagramNode[] = [
    { id: 0, label: "Input" },
{ id: 1, label: "Process" },
{ id: 2, label: "Output" },
];

private _inputEdges: DiagramEdge[] = [
  { from: 0, to: 1 },
  { from: 1, to: 2 },
  { from: 2, to: 0 },
];

// ── Состояние ──────────────────────────────────────────────
iNodes: INode[] = [];
iEdges: IEdge[] = [];

zoom = 1;
panX = 0;
panY = 0;

get zoomLabel(): string { return Math.round(this.zoom * 100) + "%"; }

isPanning = false;
dragIdx   = -1;

private panSX = 0; private panSY = 0;
private panOX = 0; private panOY = 0;
private drgSX = 0; private drgSY = 0;
private drgOX = 0; private drgOY = 0;
private didDrag = false;

@ViewChild("host", { static: true }) hostRef!: ElementRef<HTMLDivElement>;

constructor(private cdr: ChangeDetectorRef) {
  this.initNodes();
}

// ── Инициализация узлов из @Input ─────────────────────────
private initNodes(): void {
  const pos = circlePositions(this._inputNodes.length, 250, 200, 150);
  this.iNodes = this._inputNodes.map((n, i) => ({
    id:    n.id,
    label: n.label,
    wx:    n.wx ?? pos[i].wx,
    wy:    n.wy ?? pos[i].wy,
  }));
}

// ── AfterViewInit: центрируем после первого рендера DOM ───
ngAfterViewInit(): void {
// Два rAF гарантируют, что Angular закончил рендер и host имеет размеры
  requestAnimationFrame(() => requestAnimationFrame(() => {
  this.centerView();
}));
}

// ── Экранные координаты центра узла i ─────────────────────
// (используются и в шаблоне для [style.left]/[style.top], и в render())
sx(i: number): number { return this.panX + this.iNodes[i].wx * this.zoom; }
sy(i: number): number { return this.panY + this.iNodes[i].wy * this.zoom; }

nodeTransform(): string {
  return 'translate(-50%, -50%) scale(${this.zoom})';
}

// ── Рендер рёбер по экранным координатам ─────────────────
render(): void {
  if (!this.iNodes.length) return;


const hw = (NODE_W * this.zoom) / 2;
const hh = (NODE_H * this.zoom) / 2;

this.iEdges = this._inputEdges.map(e => {
  const ai = this.iNodes.findIndex(n => n.id === e.from);
  const bi = this.iNodes.findIndex(n => n.id === e.to);
  if (ai < 0 || bi < 0) return null!;

  const ax = this.sx(ai), ay = this.sy(ai);
  const bx = this.sx(bi), by = this.sy(bi);
  const dx = bx - ax, dy = by - ay;

  // Обрезка у края прямоугольника узла
  const tx   = dx !== 0 ? hw / Math.


  abs(dx) : Infinity;
  const ty   = dy !== 0 ? hh / Math.abs(dy) : Infinity;
  const clip = Math.min(tx, ty, 1) * 0.9;

  const x1 = ax + dx * clip, y1 = ay + dy * clip;
  const x2 = bx - dx * clip, y2 = by - dy * clip;

  // Кривая Безье (контрольные точки — горизонтальные выносы)
  const path =
    `M${x1},${y1} C${x1 + dx * 0.4},${y1} ${x2 - dx * 0.4},${y2} ${x2},${y2}`;

  return { id: `${e.from}-${e.to}`, path } as IEdge;
}).filter(Boolean);

this.cdr.markForCheck();
}

// ── Zoom ──────────────────────────────────────────────────
zoomIn():  void { this.zoomAt( ZOOM_STEP, this.hcx(), this.hcy()); }
zoomOut(): void { this.zoomAt(-ZOOM_STEP, this.hcx(), this.hcy()); }

resetView(): void { this.zoom = 1; this.panX = 0; this.panY = 0; this.centerView(); }

private zoomAt(delta: number, cx: number, cy: number): void {
  const nz = Math.max(MIN_ZOOM, Math.min(MAX_ZOOM, this.zoom + delta));
  const s  = nz / this.zoom;
  this.panX = cx - s * (cx - this.panX);
  this.panY = cy - s * (cy - this.panY);
  this.zoom = nz;
  this.render();
}

onWheel(e: WheelEvent): void {
  if (!e.ctrlKey) return;
e.preventDefault();
const r = this.hostEl.getBoundingClientRect();
this.zoomAt(
  e.deltaY < 0 ? ZOOM_STEP : -ZOOM_STEP,
  e.clientX - r.left,
  e.clientY - r.top,
);
}

// ── Pan фона ──────────────────────────────────────────────
onHostMouseDown(e: MouseEvent): void {
  if ((e.target as HTMLElement).closest(".diagram-node")) return;
this.isPanning = true;
this.panSX = e.clientX; this.panSY = e.clientY;
this.panOX = this.panX; this.panOY = this.panY;
}

// ── Drag узла: mousedown на обёртке ───────────────────────
// Обёртка — div поверх button, перехватывает drag
onNodeMouseDown(e: MouseEvent, i: number): void {
  e.preventDefault();   // не даём браузеру выделять текст
  e.stopPropagation();
  this.dragIdx = i;
  this.didDrag = false;
  this.drgSX = e.clientX; this.drgSY = e.clientY;
  this.drgOX = this.iNodes[i].wx;
  this.drgOY = this.iNodes[i].wy;
}

// ── Click узла (только если не было перемещения) ──────────
onNodeClick(e: MouseEvent, node: INode): void {
  if (this.didDrag) { e.stopPropagation(); e.preventDefault(); return; }
console.log("Clicked node:", node.label);
// Сюда можно добавить emit через @Output
}

// ── Глобальные события ────────────────────────────────────
@HostListener("window:mousemove", ["$event"])
onMouseMove(e: MouseEvent): void {
  if (this.isPanning) {
  this.panX = this.panOX + e.clientX - this.panSX;
  this.panY = this.panOY + e.clientY - this.panSY;
  this.render();
} else if (this.dragIdx >= 0) {
  const dx = e.clientX - this.drgSX;
  const dy = e.clientY - this.drgSY;
  if (Math.abs(dx) > 2 || Math.abs(dy) > 2) this.didDrag = true;
  this.iNodes[this.dragIdx] = {
    ...this.iNodes[this.dragIdx],
    wx: this.drgOX + dx / this.zoom,
    wy: this.drgOY + dy / this.zoom,
};
  this.render();
}
}

@HostListener("window:mouseup")
onMouseUp(): void {
  this.dragIdx   = -1;
  this.isPanning = false;
  this.cdr.markForCheck();
}

// ── Центрирование ─────────────────────────────────────────
private centerView(): void {
  const r = this.hostEl.getBoundingClientRect();
  if (!r.width || !this.iNodes.length) return;
const cx = this.iNodes.reduce((s, n) => s + n.wx, 0) / this.iNodes.length;
const cy = this.iNodes.reduce((s, n) => s + n.wy, 0) / this.iNodes.length;
this.panX = r.width  / 2 - cx * this.zoom;
this.panY = r.height / 2 - cy * this.zoom;
this.render();
}

private get hostEl(): HTMLDivElement { return this.hostRef.nativeElement; }
private hcx(): number { return this.hostEl.getBoundingClientRect().width  / 2; }
private hcy(): number { return this.hostEl.getBoundingClientRect().height / 2; }
}

// import {
//   Component,
//   ElementRef,
//   HostListener,
//   OnInit,
//   ViewChild,
//   ChangeDetectionStrategy,
//   ChangeDetectorRef,
//   NgZone,
// } from '@angular/core';
// import { CommonModule } from '@angular/common';
//
// interface DiagramNode {
//   id: number;
//   wx: number; // world X (до zoom/pan)
//   wy: number; // world Y
//   label: string;
//   icon: string;
//   sub: string;
// }
//
// interface DiagramEdge {
//   id: number;
//   colorIdx: number;
//   path: string;
//   dotX: number;
//   dotY: number;
//   dotDelay: string;
// }
//
// const NODE_W = 160;
// const NODE_H = 64;
// const MIN_ZOOM = 0.2;
// const MAX_ZOOM = 3;
// const ZOOM_STEP = 0.15;
//
// // Пары узлов, которые соединяем рёбрами: [fromIdx, toIdx]
// const EDGE_PAIRS: [number, number][] = [[0, 1], [1, 2], [2, 0]];
//
// @Component({
//   selector: 'app-diagram',
//   standalone: true,
//   imports: [CommonModule],
//   templateUrl: './diagram.component.html',
//   styleUrl: './diagram.component.scss',
//   changeDetection: ChangeDetectionStrategy.OnPush,
// })
// export class DiagramComponent implements OnInit {
//   @ViewChild('host', { static: true }) hostRef!: ElementRef<HTMLDivElement>;
//
//   // ── Состояние viewport ─────────────────────────────
//   zoom = 1;
//   panX = 0;
//   panY = 0;
//
//   get zoomPercent(): number {
//     return Math.round(this.zoom * 100);
//   }
//
//   // ── Узлы ───────────────────────────────────────────
//   nodes: DiagramNode[] = [
//     { id: 0, wx: 220, wy: 180, label: 'Input',   icon: '⚡', sub: 'trigger'   },
//     { id: 1, wx: 500, wy: 120, label: 'Process',  icon: '⚙️', sub: 'transform' },
//     { id: 2, wx: 360, wy: 340, label: 'Output',   icon: '✦', sub: 'result'    },
//   ];
//
//   // ── Рёбра (пересчитываются при render) ─────────────
//   edges: DiagramEdge[] = [];
//
//   // ── Состояние drag/pan ─────────────────────────────
//   isPanning = false;
//   dragIndex = -1;
//
//   private panStartX = 0;
//   private panStartY = 0;
//   private panOriginX = 0;
//   private panOriginY = 0;
//
//   private dragStartX = 0;
//   private dragStartY = 0;
//   private dragOriginWx = 0;
//   private dragOriginWy = 0;
//
//   constructor(private cdr: ChangeDetectorRef, private ngZone: NgZone) {}
//
//   ngOnInit(): void {
//     // Ждём, пока Angular отрисует DOM и host получит размеры
//     requestAnimationFrame(() => requestAnimationFrame(() => {
//       this.centerView();
//       this.cdr.markForCheck();
//     }));
//   }
//
//   // ── Экранные координаты центра узла ───────────────
//   screenX(i: number): number {
//     return this.panX + this.nodes[i].wx * this.zoom;
//   }
//
//   screenY(i: number): number {
//     return this.panY + this.nodes[i].wy * this.zoom;
//   }
//
//   // ── Главный рендер ────────────────────────────────
//   private render(): void {
//     this.edges = EDGE_PAIRS.map(([a, b], idx) => {
//       const ax = this.screenX(a), ay = this.screenY(a);
//       const bx = this.screenX(b), by = this.screenY(b);
//
//       // Обрезаем рёбра у края прямоугольника узла
//       const hw = (NODE_W * this.zoom) / 2;
//       const hh = (NODE_H * this.zoom) / 2;
//       const dx = bx - ax, dy = by - ay;
//       const tx = dx !== 0 ? hw / Math.abs(dx) : Infinity;
//       const ty = dy !== 0 ? hh / Math.abs(dy) : Infinity;
//       const clip = Math.min(tx, ty, 1) * 0.95;
//
//       const startX = ax + dx * clip;
//       const startY = ay + dy * clip;
//       const endX   = bx - dx * clip;
//       const endY   = by - dy * clip;
//
//       // Кривая Безье
//       const c1x = startX + dx * 0.35, c1y = startY;
//       const c2x = startX + dx * 0.65, c2y = endY;
//       const path = `M${startX},${startY} C${c1x},${c1y} ${c2x},${c2y} ${endX},${endY}`;
//
//       // Точка на середине кривой (t=0.5)
//       const t = 0.5, u = 1 - t;
//       const dotX = u**3*startX + 3*u**2*t*c1x + 3*u*t**2*c2x + t**3*endX;
//       const dotY = u**3*startY + 3*u**2*t*c1y + 3*u*t**2*c2y + t**3*endY;
//
//       return {
//         id: idx,
//         colorIdx: idx + 1,
//         path,
//         dotX,
//         dotY,
//         dotDelay: `${idx * 0.6}s`,
//       };
//     });
//
//     this.cdr.markForCheck();
//   }
//
//   // ── Zoom ──────────────────────────────────────────
//   zoomIn(): void  { this.zoomAt(ZOOM_STEP, this.hostCx(), this.hostCy()); }
//   zoomOut(): void { this.zoomAt(-ZOOM_STEP, this.hostCx(), this.hostCy()); }
//
//   resetView(): void {
//     this.zoom = 1;
//     this.panX = 0;
//     this.panY = 0;
//     this.centerView();
//   }
//
//   private zoomAt(delta: number, cx: number, cy: number): void {
//     const newZoom = Math.max(MIN_ZOOM, Math.min(MAX_ZOOM, this.zoom + delta));
//     const scale   = newZoom / this.zoom;
//     this.panX = cx - scale * (cx - this.panX);
//     this.panY = cy - scale * (cy - this.panY);
//     this.zoom = newZoom;
//     this.render();
//   }
//
//   onWheel(e: WheelEvent): void {
//     if (!e.ctrlKey) return;
//     e.preventDefault();
//     const r = this.hostEl.getBoundingClientRect();
//     this.zoomAt(
//       e.deltaY < 0 ? ZOOM_STEP : -ZOOM_STEP,
//       e.clientX - r.left,
//       e.clientY - r.top,
//     );
//   }
//
//   // ── Pan (перетаскивание фона) ──────────────────────
//   onHostMouseDown(e: MouseEvent): void {
//     if ((e.target as HTMLElement).closest('.node')) return;
//     this.isPanning = true;
//     this.panStartX  = e.clientX;
//     this.panStartY  = e.clientY;
//     this.panOriginX = this.panX;
//     this.panOriginY = this.panY;
//   }
//
//   // ── Node drag ─────────────────────────────────────
//   onNodeMouseDown(e: MouseEvent, i: number): void {
//     e.stopPropagation();
//     this.dragIndex    = i;
//     this.dragStartX   = e.clientX;
//     this.dragStartY   = e.clientY;
//     this.dragOriginWx = this.nodes[i].wx;
//     this.dragOriginWy = this.nodes[i].wy;
//   }
//
//   // ── Глобальные события мыши ────────────────────────
//   @HostListener('window:mousemove', ['$event'])
//   onMouseMove(e: MouseEvent): void {
//     if (this.isPanning) {
//       this.panX = this.panOriginX + e.clientX - this.panStartX;
//       this.panY = this.panOriginY + e.clientY - this.panStartY;
//       this.render();
//     } else if (this.dragIndex >= 0) {
//       this.nodes[this.dragIndex] = {
//         ...this.nodes[this.dragIndex],
//         wx: this.dragOriginWx + (e.clientX - this.dragStartX) / this.zoom,
//         wy: this.dragOriginWy + (e.clientY - this.dragStartY) / this.zoom,
//       };
//       this.render();
//     }
//   }
//
//   @HostListener('window:mouseup')
//   onMouseUp(): void {
//     this.dragIndex = -1;
//     this.isPanning = false;
//     this.cdr.markForCheck();
//   }
//
//   // ── Вспомогательные ───────────────────────────────
//   private centerView(): void {
//     const r = this.hostEl.getBoundingClientRect();
//     if (!r.width) return;
//     const cx = this.nodes.reduce((s, n) => s + n.wx, 0) / this.nodes.length;
//     const cy = this.nodes.reduce((s, n) => s + n.wy, 0) / this.nodes.length;
//     this.panX = r.width  / 2 - cx * this.zoom;
//     this.panY = r.height / 2 - cy * this.zoom;
//     this.render();
//   }
//
//   private get hostEl(): HTMLDivElement {
//     return this.hostRef.nativeElement;
//   }
//
//   private hostCx(): number { return this.hostEl.getBoundingClientRect().width  / 2; }
//   private hostCy(): number { return this.hostEl.getBoundingClientRect().height / 2; }
// }
