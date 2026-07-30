// shared across test files that need to simulate a display's physical resolution for
// useIsBigScreen — jsdom defaults window.screen.width/height to 0
export function stubScreenSize(width: number, height: number) {
  Object.defineProperty(window.screen, 'width', { value: width, configurable: true });
  Object.defineProperty(window.screen, 'height', { value: height, configurable: true });
}
