export function byId<T extends HTMLElement>(id: string): T {
  const node = document.getElementById(id);
  if (!node) {
    throw new Error(`Missing required DOM node: ${id}`);
  }

  return node as T;
}

export function flashBeat(node: HTMLElement, isDownbeat: boolean): void {
  node.classList.remove('flash', 'downbeat');
  void node.offsetWidth;
  node.classList.add('flash');
  if (isDownbeat) {
    node.classList.add('downbeat');
  }
}
