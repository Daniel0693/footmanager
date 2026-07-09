import "@testing-library/jest-dom";

// jsdom n'implémente pas PointerEvent (limitation connue) : nécessaire pour
// interagir avec les composants Base UI pilotés au pointeur (Checkbox,
// Select...) via userEvent dans les tests. Polyfill minimal standard.
if (!window.PointerEvent) {
  class PointerEvent extends MouseEvent {
    public pointerId?: number;
    public pointerType?: string;
    public isPrimary?: boolean;

    constructor(type: string, params: PointerEventInit = {}) {
      super(type, params);
      this.pointerId = params.pointerId ?? 0;
      this.pointerType = params.pointerType ?? "mouse";
      this.isPrimary = params.isPrimary ?? false;
    }
  }
  // @ts-expect-error -- polyfill jsdom, pas le type DOM complet
  window.PointerEvent = PointerEvent;
}
if (!window.HTMLElement.prototype.hasPointerCapture) {
  window.HTMLElement.prototype.hasPointerCapture = () => false;
}
if (!window.HTMLElement.prototype.setPointerCapture) {
  window.HTMLElement.prototype.setPointerCapture = () => {};
}
if (!window.HTMLElement.prototype.releasePointerCapture) {
  window.HTMLElement.prototype.releasePointerCapture = () => {};
}
