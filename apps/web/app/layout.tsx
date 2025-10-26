import './globals.css';
import type { ReactNode } from 'react';

export const metadata = {
  title: 'Autonomous Platform UI',
  description: 'Live pipeline UI for planner → implementer → runner → validator',
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en">
      <body className="min-h-screen bg-neutral-950 text-neutral-100">
        <div className="max-w-7xl mx-auto p-6">
          <header className="mb-6 flex items-center justify-between">
            <h1 className="text-lg font-semibold tracking-tight">Autonomous Platform</h1>
            <a href="/" className="text-sm underline underline-offset-4">New Session</a>
          </header>
          {children}
        </div>
      </body>
    </html>
  );
}

