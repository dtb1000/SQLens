// The lessons. Two tracks that build in order: Beginner (reading data with SELECT, filtering,
// sorting, grouping, joining, changing data) and Intermediate (subqueries, WITH, window functions,
// views, set operations and the patterns asked about in job interviews).
//
// Each lesson runs on one of the built-in example databases. "Check my answer" runs the learner's
// query and the lesson's own answer on the same data and compares the two results.
//   data      which example database: company, school or library
//   intro     what the idea is, in a few sentences (HTML)
//   task      what to write (HTML)
//   start     what is put in the Query area
//   answer    a query that gives the right result
//   ordered   the rows must come in the same order (the task asks for a sort)
//   names     the column names must match too (the task asks for a name)
//   must      words the query has to use, so the lesson's idea is practised: [regex source, what to say]
//   change    the task changes data: Check starts from fresh data, runs every statement, then runs verify
//   hints     shown one at a time

export const TRACKS = [
  { id: 'beginner', title: 'Beginner', blurb: 'Read data with SELECT, then filter, sort, count, group and join. No experience needed.' },
  { id: 'intermediate', title: 'Intermediate', blurb: 'Subqueries, WITH, window functions, views and the questions asked in interviews.' }
];

const c = s => `<code>${s}</code>`;

export const LESSONS = [
  /* ============================== Beginner ============================== */
  {
    id: 'b-select', track: 'beginner', data: 'company', title: 'Choose columns with SELECT and FROM',
    intro: `<p>A database keeps data in <b>tables</b>. A table is a grid: each <b>row</b> is one thing (here, one employee), and each <b>column</b> is one fact about it (a name, a salary, a city).</p>
      <p>Every query that reads data starts with two parts. ${c('FROM')} says which table to read. ${c('SELECT')} says which columns you want back, separated by commas.</p>
      <pre>SELECT column1, column2
FROM table_name;</pre>
      <p>Look at the Tables area on the right: as you type, the columns you pick light up in blue.</p>`,
    task: `Show the ${c('name')} and ${c('city')} of every employee, from the ${c('employees')} table.`,
    start: '-- Write your query here, then press Check my answer.\n',
    answer: 'SELECT name, city FROM employees;',
    hints: ['The table is employees, so the query ends with FROM employees.', 'Put the two column names after SELECT, with a comma between them.'],
  },
  {
    id: 'b-star-as', track: 'beginner', data: 'company', title: 'All columns, and naming columns with AS',
    intro: `<p>${c('SELECT *')} means "every column". It is handy for a first look at a table.</p>
      <p>You can also work something out in SELECT, such as ${c('salary / 12')}, and give the new column a name with ${c('AS')}. The name only changes how the result is labelled. The table itself is not changed.</p>
      <pre>SELECT name, salary / 12 AS monthly
FROM employees;</pre>`,
    task: `Show each department's ${c('name')} in a column called ${c('department')}, and its ${c('floor')}.`,
    start: '-- The departments table has the columns id, name and floor.\n',
    answer: 'SELECT name AS department, floor FROM departments;',
    names: true,
    hints: ['Read from the departments table.', 'Write name AS department to rename the column.'],
  },
  {
    id: 'b-where', track: 'beginner', data: 'company', title: 'Keep some rows with WHERE',
    intro: `<p>${c('WHERE')} keeps only the rows that pass a test. It comes after FROM.</p>
      <p>Tests compare a column with a value: ${c('=')} equal, ${c('&lt;&gt;')} not equal, ${c('&gt;')} greater, ${c('&lt;')} less, ${c('&gt;=')} and ${c('&lt;=')}. Text goes in single quotes, like ${c("'Leeds'")}. Numbers do not.</p>
      <pre>SELECT name
FROM employees
WHERE city = 'Leeds';</pre>
      <p>Watch the Tables area: the rows WHERE removes are struck through.</p>`,
    task: `Show the ${c('name')} and ${c('salary')} of employees who earn more than 60000.`,
    start: '',
    answer: 'SELECT name, salary FROM employees WHERE salary > 60000;',
    must: [['\\bWHERE\\b', 'Use WHERE to keep only some of the rows.']],
    hints: ['The test is salary > 60000.', 'SELECT name, salary FROM employees WHERE ...'],
  },
  {
    id: 'b-andor', track: 'beginner', data: 'company', title: 'Combine tests with AND, OR and brackets',
    intro: `<p>${c('AND')} keeps a row only when both tests are true. ${c('OR')} keeps it when either one is true.</p>
      <p>When you mix them, use brackets to say what belongs together, the same as in maths. Without brackets, AND is worked out before OR, which is often not what you meant.</p>
      <pre>WHERE (city = 'Leeds' OR city = 'London')
  AND salary &gt; 50000</pre>`,
    task: `Show the ${c('name')}, ${c('city')} and ${c('salary')} of employees who are in Leeds or Manchester and earn less than 60000.`,
    start: '',
    answer: "SELECT name, city, salary FROM employees WHERE (city = 'Leeds' OR city = 'Manchester') AND salary < 60000;",
    hints: ['You need two kinds of test: the city, and the salary.', "Put the two city tests in brackets: (city = 'Leeds' OR city = 'Manchester')."],
  },
  {
    id: 'b-in-between-like', track: 'beginner', data: 'company', title: 'Shortcuts: IN, BETWEEN and LIKE',
    intro: `<p>Three shortcuts save typing:</p>
      <ul><li>${c("city IN ('Leeds', 'London')")} is the same as two tests joined with OR.</li>
      <li>${c('salary BETWEEN 50000 AND 60000')} includes both ends: 50000 and 60000 both pass.</li>
      <li>${c("name LIKE 'D%'")} matches text by a pattern. ${c('%')} stands for any run of letters, so this means "starts with D". ${c('_')} stands for exactly one letter.</li></ul>`,
    task: `Show the ${c('name')} and ${c('salary')} of employees whose salary is between 50000 and 60000.`,
    start: '',
    answer: 'SELECT name, salary FROM employees WHERE salary BETWEEN 50000 AND 60000;',
    must: [['\\bBETWEEN\\b', 'This lesson is about BETWEEN. Try writing the test with it.']],
    hints: ['WHERE salary BETWEEN ... AND ...'],
  },
  {
    id: 'b-null', track: 'beginner', data: 'company', title: 'Empty values: NULL',
    intro: `<p>A cell with no value holds ${c('NULL')}. It means "unknown" or "missing", not zero and not empty text.</p>
      <p>NULL is never equal to anything, not even to another NULL, so ${c('dept_id = NULL')} never finds a row. Use ${c('IS NULL')} and ${c('IS NOT NULL')} instead.</p>
      <p>This catches people out in interviews too: ${c('WHERE dept_id &lt;&gt; 2')} also drops rows where dept_id is NULL, because the test gives "unknown", and WHERE only keeps rows that are definitely true.</p>`,
    task: `Show the ${c('name')} of every employee who has no department (their ${c('dept_id')} is empty).`,
    start: '',
    answer: 'SELECT name FROM employees WHERE dept_id IS NULL;',
    must: [['\\bIS\\s+NULL\\b', 'Use IS NULL. A test with = NULL never finds anything.']],
    hints: ['= NULL never matches. You need IS NULL.'],
  },
  {
    id: 'b-order', track: 'beginner', data: 'company', title: 'Sort with ORDER BY, and keep the first rows with LIMIT',
    intro: `<p>A table has no fixed order. If the order matters, say so with ${c('ORDER BY')}. ${c('ASC')} (the default) sorts smallest first, ${c('DESC')} biggest first. You can sort by more than one column: ${c('ORDER BY city, name')}.</p>
      <p>${c('LIMIT 3')} keeps only the first three rows of the result. It comes last. Some databases write this differently: SQL Server uses ${c('SELECT TOP 3')}, and Oracle uses ${c('FETCH FIRST 3 ROWS ONLY')}.</p>`,
    task: `Show the ${c('name')} and ${c('salary')} of the three highest paid employees, highest first.`,
    start: '',
    answer: 'SELECT name, salary FROM employees ORDER BY salary DESC LIMIT 3;',
    ordered: true,
    hints: ['Sort by salary, biggest first: ORDER BY salary DESC.', 'Then add LIMIT 3 at the end.'],
  },
  {
    id: 'b-distinct', track: 'beginner', data: 'company', title: 'Remove repeats with DISTINCT',
    intro: `<p>${c('SELECT DISTINCT')} removes repeated rows from the result, so each different row appears once.</p>
      <pre>SELECT DISTINCT city
FROM employees;</pre>
      <p>With more than one column, a row is only a repeat if every column matches.</p>`,
    task: `List each city that has an employee, once each, in alphabetical order.`,
    start: '',
    answer: 'SELECT DISTINCT city FROM employees ORDER BY city;',
    ordered: true,
    must: [['\\bDISTINCT\\b', 'Use DISTINCT to show each city once.']],
    hints: ['SELECT DISTINCT city FROM employees', 'Add ORDER BY city for alphabetical order.'],
  },
  {
    id: 'b-aggregate', track: 'beginner', data: 'company', title: 'Count and add up: COUNT, SUM, AVG, MIN, MAX',
    intro: `<p>Aggregate functions squash many rows into one value:</p>
      <ul><li>${c('COUNT(*)')} counts rows. ${c('COUNT(column)')} counts only the rows where that column is not NULL.</li>
      <li>${c('SUM')}, ${c('AVG')}, ${c('MIN')} and ${c('MAX')} add up, average, and find the smallest and biggest value. They skip NULLs.</li></ul>
      <p>Without GROUP BY (the next lesson), the whole table becomes one row.</p>`,
    task: `In one row, show how many employees there are, as ${c('people')}, and their average salary, as ${c('avg_salary')}.`,
    start: '',
    answer: 'SELECT COUNT(*) AS people, AVG(salary) AS avg_salary FROM employees;',
    names: true,
    hints: ['COUNT(*) AS people', 'AVG(salary) AS avg_salary'],
  },
  {
    id: 'b-group', track: 'beginner', data: 'company', title: 'One row per group: GROUP BY',
    intro: `<p>${c('GROUP BY city')} puts the rows into buckets, one for each different city, and then makes one row per bucket. An aggregate like COUNT(*) is then worked out inside each bucket.</p>
      <pre>SELECT city, COUNT(*) AS people
FROM employees
GROUP BY city;</pre>
      <p>The rule: every column in SELECT must either be in GROUP BY or be inside an aggregate. Press Run, then open How it ran to see the buckets.</p>`,
    task: `Show each ${c('city')} with its number of employees (call it ${c('people')}) and the highest salary there (call it ${c('top_salary')}).`,
    start: '',
    answer: 'SELECT city, COUNT(*) AS people, MAX(salary) AS top_salary FROM employees GROUP BY city;',
    names: true,
    must: [['\\bGROUP\\s+BY\\b', 'Use GROUP BY to make one row per city.']],
    hints: ['GROUP BY city', 'SELECT city, COUNT(*) AS people, MAX(salary) AS top_salary ...'],
  },
  {
    id: 'b-having', track: 'beginner', data: 'company', title: 'Filter groups with HAVING',
    intro: `<p>WHERE filters rows before they are grouped. ${c('HAVING')} filters the groups afterwards, so it can test an aggregate, such as ${c('COUNT(*) &gt; 2')}.</p>
      <p>The database works in this order: FROM, WHERE, GROUP BY, HAVING, SELECT, ORDER BY. That is why WHERE can not use COUNT(*): the groups do not exist yet.</p>`,
    task: `Show each ${c('city')} that has more than 2 employees, with the number of employees as ${c('people')}.`,
    start: '',
    answer: 'SELECT city, COUNT(*) AS people FROM employees GROUP BY city HAVING COUNT(*) > 2;',
    must: [['\\bHAVING\\b', 'Use HAVING to filter the groups.']],
    hints: ['Group by city first, then add HAVING COUNT(*) > 2.'],
  },
  {
    id: 'b-join', track: 'beginner', data: 'company', title: 'Combine two tables with JOIN',
    intro: `<p>Data is split across tables so each fact is stored once. ${c('employees.dept_id')} holds the ${c('id')} of a row in ${c('departments')}. Click Map in the Tables area to see this link.</p>
      <p>${c('JOIN ... ON')} puts matching rows side by side. Short names for the tables (aliases) keep it readable:</p>
      <pre>SELECT e.name, d.name
FROM employees e
JOIN departments d ON e.dept_id = d.id;</pre>
      <p>A plain JOIN (also called INNER JOIN) keeps only rows that found a match.</p>`,
    task: `Show each employee's ${c('name')} with the name of their department, as ${c('department')}.`,
    start: '',
    answer: 'SELECT e.name, d.name AS department FROM employees e JOIN departments d ON e.dept_id = d.id;',
    names: true,
    must: [['\\bJOIN\\b', 'Use JOIN to combine the two tables.']],
    hints: ['FROM employees e JOIN departments d ON e.dept_id = d.id', 'SELECT e.name, d.name AS department'],
  },
  {
    id: 'b-leftjoin', track: 'beginner', data: 'company', title: 'Keep rows with no match: LEFT JOIN',
    intro: `<p>${c('LEFT JOIN')} keeps every row of the first (left) table, even when nothing matches on the right. The right-hand columns are then NULL.</p>
      <p>It answers questions like "which departments have no staff?": join, then keep the rows where the right side is NULL.</p>
      <pre>FROM departments d
LEFT JOIN employees e ON e.dept_id = d.id</pre>`,
    task: `Show the ${c('name')} of every department that has no employees.`,
    start: '',
    answer: 'SELECT d.name FROM departments d LEFT JOIN employees e ON e.dept_id = d.id WHERE e.id IS NULL;',
    must: [['\\bLEFT\\s+(OUTER\\s+)?JOIN\\b', 'This lesson is about LEFT JOIN. Try writing it with one.']],
    hints: ['Start from departments and LEFT JOIN employees.', 'Keep the rows where e.id IS NULL: those found no employee.'],
  },
  {
    id: 'b-threejoin', track: 'beginner', data: 'school', title: 'Three tables, and a many to many link',
    intro: `<p>A student takes many courses, and a course has many students. A link like that needs a table in the middle: each row of ${c('enrolments')} says one student takes one course.</p>
      <p>To get from students to courses you join twice, once to the middle table and once from it:</p>
      <pre>FROM enrolments e
JOIN students s ON s.id = e.student_id
JOIN courses c ON c.id = e.course_id</pre>
      <p>This lesson uses the School example database.</p>`,
    task: `Show each student's ${c('name')}, the ${c('title')} of each course they take, and their ${c('grade')}, sorted by student name and then course title.`,
    start: '',
    answer: 'SELECT s.name, c.title, e.grade FROM enrolments e JOIN students s ON s.id = e.student_id JOIN courses c ON c.id = e.course_id ORDER BY s.name, c.title;',
    ordered: true,
    hints: ['Start FROM enrolments, then JOIN students and JOIN courses.', 'ORDER BY s.name, c.title'],
  },
  {
    id: 'b-case', track: 'beginner', data: 'company', title: 'Choose a value with CASE',
    intro: `<p>${c('CASE')} works out a value from tests, like "if ... then ... else" in other languages. The first test that is true wins.</p>
      <pre>CASE WHEN salary &gt;= 60000 THEN 'high'
     ELSE 'standard'
END AS band</pre>`,
    task: `Show each employee's ${c('name')} and a column ${c('band')} that says 'high' when their salary is 60000 or more, and 'standard' otherwise.`,
    start: '',
    answer: "SELECT name, CASE WHEN salary >= 60000 THEN 'high' ELSE 'standard' END AS band FROM employees;",
    names: true,
    must: [['\\bCASE\\b', 'Use CASE to choose the value.']],
    hints: ["CASE WHEN salary >= 60000 THEN 'high' ELSE 'standard' END AS band"],
  },
  {
    id: 'b-change', track: 'beginner', data: 'company', title: 'Change data: INSERT, UPDATE and DELETE',
    intro: `<p>Three statements change data:</p>
      <ul><li>${c("INSERT INTO departments (id, name, floor) VALUES (5, 'Support', 2);")} adds a row.</li>
      <li>${c("UPDATE employees SET salary = salary + 1000 WHERE id = 3;")} changes rows.</li>
      <li>${c("DELETE FROM orders WHERE id = 1;")} removes rows.</li></ul>
      <p>Always check the WHERE first: an UPDATE or DELETE without one changes <b>every</b> row. The Tables area shows what will change before you run it.</p>
      <p>Check my answer starts from fresh data and runs every statement in the Query area, so you can write more than one.</p>`,
    task: `Add a department with ${c('id')} 5, ${c('name')} 'Support' and ${c('floor')} 2. Then move Hugo Martins (employee ${c('id')} 8) into it.`,
    start: '',
    answer: "INSERT INTO departments (id, name, floor) VALUES (5, 'Support', 2);\nUPDATE employees SET dept_id = 5 WHERE id = 8;",
    change: true,
    verify: "SELECT d.id, d.name, d.floor, e.name FROM departments d LEFT JOIN employees e ON e.dept_id = d.id WHERE d.id = 5 OR e.id = 8",
    hints: ["INSERT INTO departments (id, name, floor) VALUES (5, 'Support', 2);", 'UPDATE employees SET dept_id = 5 WHERE id = 8;'],
  },

  /* ============================== Intermediate ============================== */
  {
    id: 'i-subquery', track: 'intermediate', data: 'company', title: 'A query inside a query',
    intro: `<p>A <b>subquery</b> is a query in brackets, used as a value or a list. It runs first, and the outer query uses its answer.</p>
      <pre>SELECT name
FROM employees
WHERE salary &gt; (SELECT AVG(salary) FROM employees);</pre>
      <p>With ${c('IN')} a subquery gives a list: ${c('WHERE id IN (SELECT employee_id FROM orders)')}.</p>`,
    task: `Show the ${c('name')} of every employee who has placed at least one order, using ${c('IN')} with a subquery.`,
    start: '',
    answer: 'SELECT name FROM employees WHERE id IN (SELECT employee_id FROM orders);',
    must: [['\\bIN\\s*\\(\\s*SELECT\\b', 'Use IN with a subquery: WHERE id IN (SELECT ...).']],
    hints: ['The subquery is SELECT employee_id FROM orders.', 'WHERE id IN (SELECT employee_id FROM orders)'],
  },
  {
    id: 'i-with', track: 'intermediate', data: 'company', title: 'Name a step with WITH (a CTE)',
    intro: `<p>${c('WITH')} gives a query a name before the main query, so you can use it like a table. This is called a common table expression, or CTE. It reads top to bottom, which is easier to follow than a subquery inside a subquery.</p>
      <pre>WITH dept_pay AS (
  SELECT dept_id, AVG(salary) AS avg_pay
  FROM employees
  GROUP BY dept_id
)
SELECT ...
FROM employees e
JOIN dept_pay p ON p.dept_id = e.dept_id;</pre>
      <p>How it ran shows the WITH part as its own stage.</p>`,
    task: `Using WITH, show the ${c('name')} and ${c('salary')} of each employee who earns more than the average of their own department.`,
    start: '',
    answer: 'WITH dept_pay AS (SELECT dept_id, AVG(salary) AS avg_pay FROM employees GROUP BY dept_id) SELECT e.name, e.salary FROM employees e JOIN dept_pay p ON p.dept_id = e.dept_id WHERE e.salary > p.avg_pay;',
    must: [['^\\s*WITH\\b', 'Start the query with WITH.']],
    hints: ['First work out each department\'s average salary, grouped by dept_id.', 'Then join employees to it on dept_id and keep salary > avg_pay.'],
  },
  {
    id: 'i-with2', track: 'intermediate', data: 'company', title: 'Several steps in a row',
    intro: `<p>A WITH can hold several named steps, separated by commas. Each one can use the steps before it. This is how longer reports are usually written at work: one small, checkable step at a time.</p>
      <pre>WITH a AS (...),
     b AS (SELECT ... FROM a ...)
SELECT ... FROM b;</pre>`,
    task: `Show the ${c('name')} of each employee and their total sales as ${c('total')}, only for totals over 2000, biggest first. Use one step to add up the orders per employee and a second to attach the names.`,
    start: '',
    answer: 'WITH sales AS (SELECT employee_id, SUM(amount) AS total FROM orders GROUP BY employee_id), named AS (SELECT e.name, s.total FROM sales s JOIN employees e ON e.id = s.employee_id) SELECT name, total FROM named WHERE total > 2000 ORDER BY total DESC;',
    ordered: true, names: true,
    must: [['^\\s*WITH\\b', 'Start the query with WITH.']],
    hints: ['sales AS (SELECT employee_id, SUM(amount) AS total FROM orders GROUP BY employee_id)', 'named AS (SELECT e.name, s.total FROM sales s JOIN employees e ON e.id = s.employee_id)'],
  },
  {
    id: 'i-rownumber', track: 'intermediate', data: 'company', title: 'Number rows in groups: ROW_NUMBER and PARTITION BY',
    intro: `<p>A <b>window function</b> works out a value for each row from other rows around it, without squashing the rows like GROUP BY does. ${c('OVER (...)')} says which rows to look at.</p>
      <pre>ROW_NUMBER() OVER (PARTITION BY dept_id ORDER BY salary DESC)</pre>
      <p>${c('PARTITION BY')} splits the rows into groups, and ${c('ORDER BY')} sorts each group. ROW_NUMBER gives 1, 2, 3 in that order, starting again in each group. ${c('RANK()')} is similar, but gives tied rows the same number.</p>`,
    task: `Show each employee's ${c('name')}, ${c('dept_id')} and their place by salary inside their department, highest first, as ${c('place')}. Leave out employees with no department.`,
    start: '',
    answer: 'SELECT name, dept_id, ROW_NUMBER() OVER (PARTITION BY dept_id ORDER BY salary DESC) AS place FROM employees WHERE dept_id IS NOT NULL;',
    names: true,
    must: [['\\bOVER\\s*\\(', 'Use a window function, with OVER (...).']],
    hints: ['ROW_NUMBER() OVER (PARTITION BY dept_id ORDER BY salary DESC) AS place', 'WHERE dept_id IS NOT NULL'],
  },
  {
    id: 'i-running', track: 'intermediate', data: 'company', title: 'Running totals',
    intro: `<p>An aggregate with ${c('OVER (ORDER BY ...)')} becomes a running total: each row gets the sum of itself and every row before it in that order.</p>
      <pre>SUM(amount) OVER (ORDER BY placed_on) AS so_far</pre>
      <p>Running totals and moving averages come up a lot in reporting, for example sales so far this year.</p>`,
    task: `Show each order's ${c('placed_on')} date, its ${c('amount')}, and the total of all orders up to and including that one as ${c('so_far')}, in date order.`,
    start: '',
    answer: 'SELECT placed_on, amount, SUM(amount) OVER (ORDER BY placed_on) AS so_far FROM orders ORDER BY placed_on;',
    ordered: true, names: true,
    must: [['\\bOVER\\s*\\(', 'Use SUM(...) OVER (ORDER BY ...).']],
    hints: ['SUM(amount) OVER (ORDER BY placed_on) AS so_far', 'End with ORDER BY placed_on.'],
  },
  {
    id: 'i-lag', track: 'intermediate', data: 'library', title: 'Compare with the row before: LAG',
    intro: `<p>${c('LAG(column)')} gives the value from the row before, in the window's order. ${c('LEAD')} gives the row after. The first row has no row before it, so LAG gives NULL there.</p>
      <pre>LAG(out_on) OVER (PARTITION BY borrower ORDER BY out_on)</pre>
      <p>This lesson uses the Library example database.</p>`,
    task: `For each loan, show the ${c('borrower')}, the ${c('out_on')} date, and the date of that same borrower's previous loan as ${c('previous')}. Sort by borrower, then date.`,
    start: '',
    answer: 'SELECT borrower, out_on, LAG(out_on) OVER (PARTITION BY borrower ORDER BY out_on) AS previous FROM loans ORDER BY borrower, out_on;',
    ordered: true, names: true,
    must: [['\\bLAG\\s*\\(', 'Use LAG.']],
    hints: ['PARTITION BY borrower, so each borrower starts again.', 'LAG(out_on) OVER (PARTITION BY borrower ORDER BY out_on) AS previous'],
  },
  {
    id: 'i-window-avg', track: 'intermediate', data: 'company', title: 'Group totals on every row',
    intro: `<p>GROUP BY gives one row per group. A window aggregate keeps every row and puts the group's value next to it, so you can compare each row with its group.</p>
      <pre>AVG(salary) OVER (PARTITION BY dept_id) AS dept_avg</pre>
      <p>There is no ORDER BY inside OVER here, so every row in a group gets the same value.</p>`,
    task: `Show each employee's ${c('name')}, ${c('salary')}, and the average salary of their department as ${c('dept_avg')}. Leave out employees with no department.`,
    start: '',
    answer: 'SELECT name, salary, AVG(salary) OVER (PARTITION BY dept_id) AS dept_avg FROM employees WHERE dept_id IS NOT NULL;',
    names: true,
    must: [['\\bOVER\\s*\\(', 'Use AVG(...) OVER (PARTITION BY ...).']],
    hints: ['AVG(salary) OVER (PARTITION BY dept_id) AS dept_avg'],
  },
  {
    id: 'i-topn', track: 'intermediate', data: 'company', title: 'Interview classic: the top earner in each group',
    intro: `<p>"Find the highest paid person in each department" is one of the most common interview questions. A neat answer combines the last two ideas: number the rows inside each group in a WITH step, then keep row 1.</p>
      <pre>WITH ranked AS (
  SELECT ..., ROW_NUMBER() OVER (...) AS rn
  FROM ...
)
SELECT ... FROM ranked WHERE rn = 1;</pre>
      <p>You can not write ${c('WHERE ROW_NUMBER() ...')} directly, because window functions are worked out after WHERE.</p>`,
    task: `Show the ${c('dept_id')}, ${c('name')} and ${c('salary')} of the highest paid employee in each department. Leave out employees with no department.`,
    start: '',
    answer: 'WITH ranked AS (SELECT dept_id, name, salary, ROW_NUMBER() OVER (PARTITION BY dept_id ORDER BY salary DESC) AS rn FROM employees WHERE dept_id IS NOT NULL) SELECT dept_id, name, salary FROM ranked WHERE rn = 1;',
    must: [['\\bOVER\\s*\\(', 'Use a window function to number the rows in each department.']],
    hints: ['Inside WITH: ROW_NUMBER() OVER (PARTITION BY dept_id ORDER BY salary DESC) AS rn', 'Outside: WHERE rn = 1'],
  },
  {
    id: 'i-count-gotcha', track: 'intermediate', data: 'school', title: 'COUNT(*) or COUNT(column) after a LEFT JOIN',
    intro: `<p>After a LEFT JOIN, a row with no match still exists, with NULLs on the right. ${c('COUNT(*)')} counts that row, so a course with no students would show 1. ${c('COUNT(e.student_id)')} skips NULLs and correctly shows 0.</p>
      <p>Getting this right is a small detail that interviewers like to check. This lesson uses the School example database.</p>`,
    task: `Show every course's ${c('title')} and how many students take it, as ${c('students')}, including courses nobody takes (they should show 0).`,
    start: '',
    answer: 'SELECT c.title, COUNT(e.student_id) AS students FROM courses c LEFT JOIN enrolments e ON e.course_id = c.id GROUP BY c.title;',
    names: true,
    must: [['\\bLEFT\\s+(OUTER\\s+)?JOIN\\b', 'Use LEFT JOIN so courses with no students stay in.']],
    hints: ['FROM courses c LEFT JOIN enrolments e ON e.course_id = c.id', 'COUNT(e.student_id), not COUNT(*)'],
  },
  {
    id: 'i-coalesce', track: 'intermediate', data: 'library', title: 'Fill in missing values: COALESCE',
    intro: `<p>${c('COALESCE(a, b, ...)')} gives the first value that is not NULL. It is the usual way to show a default instead of an empty cell.</p>
      <pre>COALESCE(a.name, 'Unknown') AS author</pre>
      <p>This lesson uses the Library example database. One book has no author.</p>`,
    task: `Show every book's ${c('title')} and its author's name as ${c('author')}, showing 'Unknown' when there is no author.`,
    start: '',
    answer: "SELECT b.title, COALESCE(a.name, 'Unknown') AS author FROM books b LEFT JOIN authors a ON a.id = b.author_id;",
    names: true,
    must: [['\\bCOALESCE\\s*\\(', 'Use COALESCE to fill in the missing name.']],
    hints: ['LEFT JOIN authors, so the book with no author stays in.', "COALESCE(a.name, 'Unknown') AS author"],
  },
  {
    id: 'i-dates', track: 'intermediate', data: 'library', title: 'Group by month',
    intro: `<p>Reports often group by month. Dates here are stored as text like ${c("'2026-10-03'")}, so the first 7 characters are the month: ${c('SUBSTR(out_on, 1, 7)')} gives ${c("'2026-10'")}.</p>
      <p>Date functions differ between databases: PostgreSQL has ${c("DATE_TRUNC('month', d)")}, SQL Server ${c('FORMAT(d, \'yyyy-MM\')')}, MySQL ${c("DATE_FORMAT(d, '%Y-%m')")}. The idea of grouping by the month is the same everywhere.</p>`,
    task: `Show each month as ${c('month')} (like 2026-10) and the number of loans that started in it as ${c('loans')}, in month order.`,
    start: '',
    answer: 'SELECT SUBSTR(out_on, 1, 7) AS month, COUNT(*) AS loans FROM loans GROUP BY SUBSTR(out_on, 1, 7) ORDER BY month;',
    ordered: true, names: true,
    hints: ['SUBSTR(out_on, 1, 7) AS month', 'GROUP BY the same expression, then ORDER BY month.'],
  },
  {
    id: 'i-union', track: 'intermediate', data: 'company', title: 'Stack results: UNION, INTERSECT and EXCEPT',
    intro: `<p>These combine two queries that have the same number of columns:</p>
      <ul><li>${c('UNION')} stacks the rows and removes repeats. ${c('UNION ALL')} keeps repeats, and is faster.</li>
      <li>${c('INTERSECT')} keeps rows that are in both.</li>
      <li>${c('EXCEPT')} keeps rows from the first that are not in the second. Oracle calls it ${c('MINUS')}.</li></ul>`,
    task: `List the cities that have an employee in department 1 but no employee in department 3.`,
    start: '',
    answer: 'SELECT city FROM employees WHERE dept_id = 1 EXCEPT SELECT city FROM employees WHERE dept_id = 3;',
    must: [['\\bEXCEPT\\b', 'Use EXCEPT.']],
    hints: ['SELECT city FROM employees WHERE dept_id = 1', 'EXCEPT SELECT city FROM employees WHERE dept_id = 3'],
  },
  {
    id: 'i-view', track: 'intermediate', data: 'school', title: 'Save a query as a view',
    intro: `<p>A <b>view</b> is a query saved in the database under a name. After ${c('CREATE VIEW name AS SELECT ...')}, you use the name in FROM like a table, and the saved query runs again each time, so the view always shows current data.</p>
      <p>Teams use views to share a tricky join once, so everyone else can write simple queries on top. This lesson uses the School example database.</p>`,
    task: `Create a view called ${c('report')} with each student's ${c('name')}, course ${c('title')} and ${c('grade')}. Check my answer then reads the view.`,
    start: '',
    answer: 'CREATE VIEW report AS SELECT s.name, c.title, e.grade FROM enrolments e JOIN students s ON s.id = e.student_id JOIN courses c ON c.id = e.course_id;',
    change: true,
    verify: 'SELECT name, title, grade FROM report',
    hints: ['CREATE VIEW report AS SELECT ...', 'The SELECT is the three-table join from the beginner lesson.'],
  },
  {
    id: 'i-final', track: 'intermediate', data: 'company', title: 'Put it together',
    intro: `<p>A last task that needs several ideas at once, like a real request at work. Break it into steps, check each one with Run, and use How it ran if a number looks wrong.</p>
      <p>Tip: write the WITH steps first and run each on its own, then build the final SELECT on top.</p>`,
    task: `For each department, show its name as ${c('department')}, the number of orders placed by its staff as ${c('orders')}, and the total order amount as ${c('total')}. Include departments with no orders, showing 0 for both. Sort by total, biggest first, then by department name.`,
    start: '',
    answer: 'WITH per_dept AS (SELECT e.dept_id, COUNT(o.id) AS orders, SUM(o.amount) AS total FROM employees e JOIN orders o ON o.employee_id = e.id GROUP BY e.dept_id) SELECT d.name AS department, COALESCE(p.orders, 0) AS orders, COALESCE(p.total, 0) AS total FROM departments d LEFT JOIN per_dept p ON p.dept_id = d.id ORDER BY total DESC, department;',
    ordered: true, names: true,
    hints: ['Step 1: total the orders per dept_id by joining orders to employees.', 'Step 2: LEFT JOIN departments to step 1, and COALESCE the empty ones to 0.'],
  }
];

export const lessonsIn = track => LESSONS.filter(l => l.track === track);

/* ---------- comparing two results ---------- */
const norm = v => v === null || v === undefined ? null : typeof v === 'number' ? Math.round(v * 1e6) / 1e6 : (typeof v === 'object' && 'binary' in v) ? `[${v.binary}]` : String(v);
const rowKey = r => JSON.stringify(r.map(norm));
const bag = rows => { const m = new Map(); for (const r of rows) { const k = rowKey(r); m.set(k, (m.get(k) || 0) + 1); } return m; };
const sameBag = (a, b) => { if (a.size !== b.size) return false; for (const [k, n] of a) if (b.get(k) !== n) return false; return true; };
const sortedRow = r => r.map(norm).map(x => JSON.stringify(x)).sort();

// mine and want: { cols, rows }. Returns { ok, say } in plain words.
export function compareResults(lesson, mine, want) {
  if (mine.cols.length !== want.cols.length) {
    return { ok: false, say: `Your result has ${mine.cols.length} column${mine.cols.length === 1 ? '' : 's'}, but the answer has ${want.cols.length}${lesson.names ? `: ${want.cols.join(', ')}` : ''}. Check the list after SELECT.` };
  }
  if (mine.rows.length !== want.rows.length) {
    const more = mine.rows.length > want.rows.length;
    return { ok: false, say: `Your result has ${mine.rows.length} row${mine.rows.length === 1 ? '' : 's'}, but the answer has ${want.rows.length}. ${more ? 'Some rows should be filtered out: check your WHERE, JOIN or HAVING.' : 'Some rows are missing: check your WHERE, and whether a JOIN drops rows with no match.'}` };
  }
  const exact = sameBag(bag(mine.rows), bag(want.rows));
  let colsSwapped = false;
  if (!exact) {
    // the same values, but the columns in another order?
    const a = new Map(), b = new Map();
    for (const r of mine.rows) { const k = JSON.stringify(sortedRow(r)); a.set(k, (a.get(k) || 0) + 1); }
    for (const r of want.rows) { const k = JSON.stringify(sortedRow(r)); b.set(k, (b.get(k) || 0) + 1); }
    if (sameBag(a, b)) colsSwapped = true;
    else return { ok: false, say: 'You have the right number of rows and columns, but some values are different. Compare your result with the task: is a test, a calculation or a join column a little off?' };
  }
  if (lesson.ordered && !colsSwapped && mine.rows.map(rowKey).join('|') !== want.rows.map(rowKey).join('|')) {
    return { ok: false, say: 'You have the right rows, but in a different order. Check ORDER BY, and DESC for biggest first.' };
  }
  if (lesson.names) {
    const lower = x => x.map(s => String(s).toLowerCase().replace(/^.*\./, ''));
    const m = lower(mine.cols), w = lower(want.cols);
    if (!colsSwapped && m.join(',') !== w.join(',')) return { ok: false, say: `The values are right. Now name the columns ${want.cols.join(', ')} with AS.` };
  }
  return { ok: true, say: colsSwapped ? 'Correct. Your columns are in a different order from the task, which is fine.' : 'Correct.' };
}
