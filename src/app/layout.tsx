import type { Metadata } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: 'Allspark OCPI Lab',
  description: 'A synthetic OCPI 2.2.1 interoperability environment.',
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return <html lang="en"><body>{children}</body></html>;
}
