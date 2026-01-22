import React from 'react';
import DatePicker from 'react-datepicker';
import "react-datepicker/dist/react-datepicker.css";

const customStyles = `
  .react-datepicker-wrapper { width: 100%; }
  .react-datepicker__input-container { width: 100%; }
  .react-datepicker {
    font-family: inherit;
    border-color: #E5E7EB;
    border-radius: 0.75rem;
    overflow: hidden;
    box-shadow: 0 4px 6px -1px rgba(0, 0, 0, 0.1), 0 2px 4px -1px rgba(0, 0, 0, 0.06);
  }
  .react-datepicker__header {
    background-color: #F9FAFB;
    border-bottom: 1px solid #E5E7EB;
    padding-top: 1rem;
  }
  .react-datepicker__day--selected {
    background-color: #2563EB !important;
    border-radius: 0.5rem;
  }
  .react-datepicker__day:hover {
    background-color: #DBEAFE !important;
    border-radius: 0.5rem;
  }
  .react-datepicker__day--keyboard-selected {
    background-color: #93C5FD !important;
    border-radius: 0.5rem;
  }
`;

interface Props {
  selected: Date | null;
  onChange: (date: Date | null) => void;
  placeholder?: string;
}

export default function CustomDatePicker({ selected, onChange, placeholder }: Props) {
  return (
      <>
        <style>{customStyles}</style>
        <div className="relative w-1/3">
          <DatePicker
              selected={selected}
              onChange={onChange}
              placeholderText={placeholder || "MM/DD/YYYY"}
              className="w-full p-3 rounded-lg bg-gray-50 dark:bg-gray-800 border-none focus:ring-2 focus:ring-blue-500 transition-all outline-none text-gray-700 dark:text-gray-200 cursor-text placeholder-gray-400 text-sm"
              dateFormat="MM/dd/yyyy"
              // Enable keyboard typing with flexible parsing
              isClearable={false}
              showYearDropdown
              showMonthDropdown
              dropdownMode="select"
              // Allow user to type freely
              strictParsing={false}
              // Prevents the calendar from being cut off
              popperPlacement="bottom-end"
              popperClassName="z-50"
              // Show calendar icon only, but don't prevent typing
              showPopperArrow={false}
              // Auto-complete partial dates intelligently
              selectsStart={false}
              selectsEnd={false}
          />
          {/* Calendar Icon - clicking opens calendar, but typing still works */}
          <div
              className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 pointer-events-none"
              aria-hidden="true"
          >
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
            </svg>
          </div>
        </div>
      </>
  );
}
