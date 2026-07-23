import type { ReactNode } from 'react';

export const metadata = {
  title: 'ADP Acquisition Intelligence Platform',
  description: 'Phase 1 acquisition intelligence workspace',
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en">
      <body
        style={{
          margin: 0,
          fontFamily: 'Georgia, "Times New Roman", serif',
          background: 'linear-gradient(160deg, #f7f3ea 0%, #e7eef5 55%, #dfe8e2 100%)',
          color: '#1d2a32',
          minHeight: '100vh',
        }}
      >
        <header
          style={{
            padding: '1.25rem 1.5rem',
            borderBottom: '1px solid rgba(29,42,50,0.12)',
            backdropFilter: 'blur(6px)',
          }}
        >
          <strong style={{ letterSpacing: '0.04em', fontSize: '1.1rem' }}>
            ADP Acquisition Intelligence
          </strong>
        </header>
        <main style={{ padding: '2rem 1.5rem', maxWidth: '52rem' }}>{children}</main>
      </body>
    </html>
  );
}
