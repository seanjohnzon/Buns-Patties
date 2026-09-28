import { ScrollViewStyleReset } from 'expo-router/html';
import type { ReactNode } from 'react';

// This file is web-only and used to configure the root HTML for every
// web page during static rendering.
// The contents of this function only run in Node.js environments and
// do not have access to the DOM or browser APIs.
export default function Root({ children }: { children: ReactNode }) {
  return (
    <html lang="en">
      <head>
        <meta charSet="utf-8" />
        <meta httpEquiv="X-UA-Compatible" content="IE=edge" />
        <meta name="viewport" content="width=device-width, initial-scale=1, shrink-to-fit=no" />

        {/*
          Disable body scrolling on web. This makes ScrollView components work closer to how they do on native.
          However, body scrolling is often nice to have for mobile web. If you want to enable it, remove this line.
        */}
        <ScrollViewStyleReset />

        {/* Using raw CSS styles as an escape-hatch to ensure the background color never flickers in dark-mode. */}
        <style dangerouslySetInnerHTML={{ __html: responsiveBackground }} />
        {/* So "Add to Home Screen" gives the owner and customers the real logo, not a placeholder. */}
        <title>Buns &amp; Patties</title>
        <meta name="description" content="Order ahead from the Buns & Patties halal smash burger truck in Houston." />
        <link rel="apple-touch-icon" href="/apple-touch-icon.png" />
        <link rel="manifest" href="/manifest.json" />
        <meta name="apple-mobile-web-app-title" content="Buns & Patties" />
        <meta name="apple-mobile-web-app-capable" content="yes" />
        <meta name="theme-color" content="#111111" />
      </head>
      <body>{children}</body>
    </html>
  );
}

const responsiveBackground = `
body {
  background-color: #fff;
}`;
