// Raw input state: pointer, buttons, keys. Interpreted by the app each frame.
export class Input {
  x = 0;
  y = 0;
  nx = 0; // normalised device coords
  ny = 0;
  inside = false;
  down = [false, false, false];
  pressed: number[] = []; // button presses this frame
  released: number[] = [];
  wheel = 0;
  keys = new Set<string>();
  keyPressed: string[] = [];
  dragDX = 0;
  dragDY = 0;
  overUI = false;
  locked = false;
  moved = false; // has the real pointer moved yet (edge-scroll guard)
  lockDX = 0;
  lockDY = 0;

  constructor(el: HTMLElement) {
    el.addEventListener('contextmenu', (e) => e.preventDefault());
    window.addEventListener('mousemove', (e) => {
      if (document.pointerLockElement) {
        this.lockDX += e.movementX;
        this.lockDY += e.movementY;
        return;
      }
      if (this.down[1] || this.down[2]) {
        this.dragDX += e.movementX;
        this.dragDY += e.movementY;
      }
      this.setPos(e.clientX, e.clientY);
      this.moved = true;
      this.overUI = !!(e.target as HTMLElement)?.closest?.('.ui-block');
    });
    el.addEventListener('mousedown', (e) => {
      this.setPos(e.clientX, e.clientY);
      this.down[e.button] = true;
      this.pressed.push(e.button);
      e.preventDefault();
    });
    window.addEventListener('mouseup', (e) => {
      if (this.down[e.button]) this.released.push(e.button);
      this.down[e.button] = false;
    });
    el.addEventListener(
      'wheel',
      (e) => {
        this.wheel += Math.sign(e.deltaY);
        e.preventDefault();
      },
      { passive: false },
    );
    window.addEventListener('keydown', (e) => {
      if ((e.target as HTMLElement)?.tagName === 'INPUT') return;
      const k = e.key.length === 1 ? e.key.toLowerCase() : e.key;
      if (!this.keys.has(k)) this.keyPressed.push(k);
      this.keys.add(k);
      if (['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', ' ', 'Tab'].includes(e.key)) e.preventDefault();
    });
    window.addEventListener('keyup', (e) => {
      const k = e.key.length === 1 ? e.key.toLowerCase() : e.key;
      this.keys.delete(k);
    });
    window.addEventListener('blur', () => {
      this.keys.clear();
      this.down = [false, false, false];
    });
    document.addEventListener('mouseleave', () => (this.inside = false));
    document.addEventListener('mouseenter', () => (this.inside = true));
  }

  setPos(x: number, y: number) {
    this.x = x;
    this.y = y;
    this.nx = (x / window.innerWidth) * 2 - 1;
    this.ny = -(y / window.innerHeight) * 2 + 1;
    this.inside = true;
  }

  endFrame() {
    this.pressed.length = 0;
    this.released.length = 0;
    this.keyPressed.length = 0;
    this.wheel = 0;
    this.dragDX = 0;
    this.dragDY = 0;
    this.lockDX = 0;
    this.lockDY = 0;
  }
}
