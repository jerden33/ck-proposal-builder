import { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'FedEx vs Circle K Network Comparison | Circle K Pro',
  description: 'Compare FedEx distribution network locations with Circle K convenience store locations',
};

export default function ComparisonLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return children;
}
