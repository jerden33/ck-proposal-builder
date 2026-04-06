import { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'FedEx vs Circle K Network Comparison | Fleet Insights',
  description: 'Compare FedEx distribution network locations with Circle K convenience store locations across the United States',
};

export default function ComparisonLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return children;
}
