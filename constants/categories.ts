export const defaultExpenseCategories = ['Coffee', 'Drinks', 'Groceries', 'Food', 'Lunch', 'Dinner', 'Fuel', 'Rent', 'Phone Top Up', 'Parking', 'Car', 'Hygiene', 'Medicine', 'Subscriptions', 'Entertainment', 'Clothing', 'Gifts', 'Other'] as const;
export const defaultIncomeCategories = ['Salary', 'Freelance', 'Client Payment', 'Refund', 'Gift', 'Transfer In', 'Other Income'] as const;
// Frozen order determines seed UUIDs. Append future defaults in a new migration.
