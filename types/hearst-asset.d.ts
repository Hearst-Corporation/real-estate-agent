import type { DetailedHTMLProps, HTMLAttributes } from "react";

declare module "react" {
  namespace JSX {
    interface IntrinsicElements {
      "hearst-asset": DetailedHTMLProps<
        HTMLAttributes<HTMLElement> & {
          "catalog-base"?: string;
          data?: string;
          id: string;
          realtime?: string;
        },
        HTMLElement
      >;
    }
  }
}
