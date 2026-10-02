import { useTranslation } from 'react-i18next';
import { CURRENCIES, currencyName } from '../../../shared/currency';

/* Amount field with its currency picker attached, so each record is saved
   in the currency it was actually paid or received in (the Settings
   currency is pre-selected). */
export default function MoneyInput({ amount, currency, onAmount, onCurrency, required, placeholder = '0.00' }) {
  const { i18n } = useTranslation();
  const codes = CURRENCIES.some((c) => c.code === currency) ? CURRENCIES : [{ code: currency }, ...CURRENCIES];
  return (
    <div className="money-input">
      <input type="number" className="form-control" placeholder={placeholder} step="0.01" min="0" required={required} value={amount} onChange={(e) => onAmount(e.target.value)} />
      <select className="form-control" value={currency} onChange={(e) => onCurrency(e.target.value)} aria-label="Currency">
        {codes.map((c) => <option key={c.code} value={c.code} title={currencyName(c.code, i18n.language)}>{c.code}</option>)}
      </select>
    </div>
  );
}
