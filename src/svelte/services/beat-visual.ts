export function flashBeat(node: HTMLElement, isDownbeat: boolean): void {
  node.classList.remove('flash', 'downbeat');
  void node.offsetWidth;
  node.classList.add('flash');
  if (isDownbeat) {
    node.classList.add('downbeat');
  }
}
