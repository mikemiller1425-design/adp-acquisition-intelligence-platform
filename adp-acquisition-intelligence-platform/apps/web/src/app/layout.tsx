import type { ReactNode } from 'react';

import './globals.css';

export const metadata = {
  title: 'ADP Acquisition Intelligence Platform',
  description: 'Phase 1 acquisition intelligence operations console',
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
