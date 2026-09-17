/** Focus containment for the Killer dialogs; Escape is handled by the app. */
export function dialogFocus(node: HTMLElement): { destroy: () => void } {
  const previous = document.activeElement instanceof HTMLElement ? document.activeElement : null;
  const controls = (): HTMLElement[] => [...node.querySelectorAll<HTMLElement>('button:not(:disabled), [href], input:not(:disabled), [tabindex="0"]')];
  let active = true;
  queueMicrotask(() => { if (active) controls()[0]?.focus(); });
  const keydown = (event: KeyboardEvent): void => {
    if (event.key !== 'Tab') return;
    const elements = controls();
    const first = elements[0], last = elements.at(-1);
    if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last?.focus(); }
    else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first?.focus(); }
  };
  node.addEventListener('keydown', keydown);
  return { destroy: () => {
    active = false;
    node.removeEventListener('keydown', keydown);
    if (previous?.isConnected) previous.focus();
  } };
}
