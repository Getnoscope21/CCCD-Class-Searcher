interface Element {
  readonly dataset: DOMStringMap;
  value: string;
}

interface HTMLElement {
  disabled: boolean;
  value: string;
}

interface EventTarget {
  readonly id: string;
  closest(selectors: string): Element | null;
}

interface Window {
  supabase: {
    createClient(url: string, anonKey: string): any;
  };
}
