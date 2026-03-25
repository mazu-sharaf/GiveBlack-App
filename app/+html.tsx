import { ScrollViewStyleReset } from "expo-router/html";
import type { PropsWithChildren } from "react";

export default function Root({ children }: PropsWithChildren) {
  return (
    <html lang="en">
      <head>
        <meta charSet="utf-8" />
        <meta httpEquiv="X-UA-Compatible" content="IE=edge" />
        <meta
          name="viewport"
          content="width=device-width, initial-scale=1, shrink-to-fit=no"
        />
        <ScrollViewStyleReset />
        <style dangerouslySetInnerHTML={{ __html: `body{overflow:hidden}#root{display:flex;flex:1}` }} />
        <script dangerouslySetInnerHTML={{ __html: `
          window.onerror = function(msg, url, line, col, error) {
            console.error('GLOBAL ERROR:', msg, 'at', url, line, col, error && error.stack);
          };
          window.onunhandledrejection = function(event) {
            console.error('UNHANDLED PROMISE:', event.reason);
          };
        `}} />
      </head>
      <body>{children}</body>
    </html>
  );
}
