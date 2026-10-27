import { fireEvent, render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import BuyCoinsScreen from '@/app/coins/buy';
import type { ShopNotice, ShopPack, ShopView } from '@/src/lib/purchases/useCoinShop';

const mocks = vi.hoisted(() => ({
  back: vi.fn(),
  buy: vi.fn(),
  checkAgain: vi.fn(),
  reload: vi.fn(),
  shop: {} as {
    view: ShopView;
    notice: ShopNotice | null;
    purchasingId: string | null;
    confirmingProductIds: string[];
  },
}));

vi.mock('expo-router', () => ({ useRouter: () => ({ back: mocks.back, push: vi.fn(), replace: vi.fn() }) }));
vi.mock('@/src/hooks/orders', () => ({ useCoinBalance: () => ({ data: { balance: 50 } }) }));
vi.mock('@/src/lib/purchases/useCoinShop', () => ({
  useCoinShop: () => ({
    ...mocks.shop,
    buy: mocks.buy,
    checkAgain: mocks.checkAgain,
    reload: mocks.reload,
    dismissNotice: vi.fn(),
  }),
}));

const pack = (over: Partial<ShopPack> = {}): ShopPack => ({
  id: 'coins_medium',
  storeProductId: 'worn.coins.350',
  coins: 350,
  label: 'Style Pack',
  priceString: '₹299.00',
  sample: false,
  popular: true,
  bestValue: false,
  ...over,
});

function show(view: ShopView, more: Partial<typeof mocks.shop> = {}) {
  mocks.shop = { view, notice: null, purchasingId: null, confirmingProductIds: [], ...more };
  return render(<BuyCoinsScreen />);
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe('Buy coins screen', () => {
  it('shows the store\'s price and buys the pack', () => {
    show({ status: 'ready', packs: [pack()] });

    const button = screen.getByRole('button', { name: 'Buy 350 coins for ₹299.00' });
    expect(screen.getByText('₹299.00')).toBeInTheDocument();
    expect(screen.queryByText(/Sample/)).toBeNull();
    fireEvent.click(button);

    expect(mocks.buy).toHaveBeenCalledWith(expect.objectContaining({ storeProductId: 'worn.coins.350' }));
  });

  it('labels a dev build\'s figure as a sample', () => {
    show({ status: 'ready', packs: [pack({ priceString: '₹299', sample: true })] });
    expect(screen.getByText('Sample ₹299')).toBeInTheDocument();
  });

  it('says honestly when the device has no store billing', () => {
    show({ status: 'no_store' });
    expect(screen.getByText("Coin packs aren't available on this device yet.")).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /^Buy / })).toBeNull();
  });

  it('says purchases are unavailable when the server can\'t verify them', () => {
    show({ status: 'unavailable' });
    expect(screen.getByText("Coin purchases aren't available right now.")).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Try again' }));
    expect(mocks.reload).toHaveBeenCalled();
  });

  it('shows the coins only once the server confirmed them, then goes back', () => {
    show({ status: 'ready', packs: [pack()] }, { notice: { kind: 'added', coins: 350, balanceAfter: 400 } });
    expect(screen.getByText('350 coins added')).toBeInTheDocument();
    expect(screen.getByText('Your balance is now 400 coins.')).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Done' }));
    expect(mocks.back).toHaveBeenCalled();
  });

  it('waits for approval on a pending purchase', () => {
    show({ status: 'ready', packs: [pack()] }, { notice: { kind: 'pending' } });
    expect(screen.getByText('Waiting for approval')).toBeInTheDocument();
  });

  it('promises the coins when the payment went through but wasn\'t confirmed', () => {
    show(
      { status: 'ready', packs: [pack()] },
      { notice: { kind: 'confirming' }, confirmingProductIds: ['worn.coins.350'] },
    );
    expect(screen.getByText("We couldn't confirm your purchase yet")).toBeInTheDocument();
    expect(screen.getByText("We'll add your coins as soon as we can.")).toBeInTheDocument();
    // The pack can't be bought again while its payment is being confirmed.
    expect(screen.getByText('Confirming…')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Buy 350 coins/ })).toBeDisabled();

    fireEvent.click(screen.getByRole('button', { name: 'Check again' }));
    expect(mocks.checkAgain).toHaveBeenCalled();
  });

  it('shows the conflict message', () => {
    show({ status: 'ready', packs: [pack()] }, { notice: { kind: 'conflict' } });
    expect(screen.getByText('This purchase was already added to another Worn account')).toBeInTheDocument();
  });

  it('shows nothing extra after a cancel', () => {
    show({ status: 'ready', packs: [pack()] });
    expect(screen.queryByTestId('purchase-notice')).toBeNull();
  });
});
