# SQLens tutorials

These are the lessons built into SQLens, written out so you can read them away from the app. The best way to do them is inside the app: click **Learn SQL step by step** on the start page or **Lessons** in the toolbar, and **Check my answer** tells you whether your query is right and what to fix. The user guide explains how the lessons work.

There are two tracks. **Beginner** needs no experience. **Intermediate** follows on from it and covers what is usually asked in interviews for entry-level data and analyst jobs. Do the lessons in order, because each one builds on the ones before it.

Each lesson uses one of the example databases that come with the app. **Company** has departments, employees and orders. **School** has students, courses and enrolments. **Library** has authors, books and loans. The user guide describes their tables.

One possible answer to every task is at the end of this page. Other queries can be right too.

## Beginner

Read data with SELECT, then filter, sort, count, group and join. No experience needed.

### B1. Choose columns with SELECT and FROM

*Company example data*

A database keeps data in **tables**. A table is a grid: each **row** is one thing (here, one employee), and each **column** is one fact about it (a name, a salary, a city).

Every query that reads data starts with two parts. `FROM` says which table to read. `SELECT` says which columns you want back, separated by commas.

```sql
SELECT column1, column2
FROM table_name;
```

Look at the Tables area on the right: as you type, the columns you pick light up in blue.

**Your task.** Show the `name` and `city` of every employee, from the `employees` table.

### B2. All columns, and naming columns with AS

*Company example data*

`SELECT *` means "every column". It is handy for a first look at a table.

You can also work something out in SELECT, such as `salary / 12`, and give the new column a name with `AS`. The name only changes how the result is labelled. The table itself is not changed.

```sql
SELECT name, salary / 12 AS monthly
FROM employees;
```

**Your task.** Show each department's `name` in a column called `department`, and its `floor`.

### B3. Keep some rows with WHERE

*Company example data*

`WHERE` keeps only the rows that pass a test. It comes after FROM.

Tests compare a column with a value: `=` equal, `<>` not equal, `>` greater, `<` less, `>=` and `<=`. Text goes in single quotes, like `'Leeds'`. Numbers do not.

```sql
SELECT name
FROM employees
WHERE city = 'Leeds';
```

Watch the Tables area: the rows WHERE removes are struck through.

**Your task.** Show the `name` and `salary` of employees who earn more than 60000.

### B4. Combine tests with AND, OR and brackets

*Company example data*

`AND` keeps a row only when both tests are true. `OR` keeps it when either one is true.

When you mix them, use brackets to say what belongs together, the same as in maths. Without brackets, AND is worked out before OR, which is often not what you meant.

```sql
WHERE (city = 'Leeds' OR city = 'London')
  AND salary > 50000
```

**Your task.** Show the `name`, `city` and `salary` of employees who are in Leeds or Manchester and earn less than 60000.

### B5. Shortcuts: IN, BETWEEN and LIKE

*Company example data*

Three shortcuts save typing:

- `city IN ('Leeds', 'London')` is the same as two tests joined with OR.

- `salary BETWEEN 50000 AND 60000` includes both ends: 50000 and 60000 both pass.

- `name LIKE 'D%'` matches text by a pattern. `%` stands for any run of letters, so this means "starts with D". `_` stands for exactly one letter.

**Your task.** Show the `name` and `salary` of employees whose salary is between 50000 and 60000.

### B6. Empty values: NULL

*Company example data*

A cell with no value holds `NULL`. It means "unknown" or "missing", not zero and not empty text.

NULL is never equal to anything, not even to another NULL, so `dept_id = NULL` never finds a row. Use `IS NULL` and `IS NOT NULL` instead.

This catches people out in interviews too: `WHERE dept_id <> 2` also drops rows where dept_id is NULL, because the test gives "unknown", and WHERE only keeps rows that are definitely true.

**Your task.** Show the `name` of every employee who has no department (their `dept_id` is empty).

### B7. Sort with ORDER BY, and keep the first rows with LIMIT

*Company example data*

A table has no fixed order. If the order matters, say so with `ORDER BY`. `ASC` (the default) sorts smallest first, `DESC` biggest first. You can sort by more than one column: `ORDER BY city, name`.

`LIMIT 3` keeps only the first three rows of the result. It comes last. Some databases write this differently: SQL Server uses `SELECT TOP 3`, and Oracle uses `FETCH FIRST 3 ROWS ONLY`.

**Your task.** Show the `name` and `salary` of the three highest paid employees, highest first.

### B8. Remove repeats with DISTINCT

*Company example data*

`SELECT DISTINCT` removes repeated rows from the result, so each different row appears once.

```sql
SELECT DISTINCT city
FROM employees;
```

With more than one column, a row is only a repeat if every column matches.

**Your task.** List each city that has an employee, once each, in alphabetical order.

### B9. Count and add up: COUNT, SUM, AVG, MIN, MAX

*Company example data*

Aggregate functions squash many rows into one value:

- `COUNT(*)` counts rows. `COUNT(column)` counts only the rows where that column is not NULL.

- `SUM`, `AVG`, `MIN` and `MAX` add up, average, and find the smallest and biggest value. They skip NULLs.

Without GROUP BY (the next lesson), the whole table becomes one row.

**Your task.** In one row, show how many employees there are, as `people`, and their average salary, as `avg_salary`.

### B10. One row per group: GROUP BY

*Company example data*

`GROUP BY city` puts the rows into buckets, one for each different city, and then makes one row per bucket. An aggregate like COUNT(*) is then worked out inside each bucket.

```sql
SELECT city, COUNT(*) AS people
FROM employees
GROUP BY city;
```

The rule: every column in SELECT must either be in GROUP BY or be inside an aggregate. Press Run, then open How it ran to see the buckets.

**Your task.** Show each `city` with its number of employees (call it `people`) and the highest salary there (call it `top_salary`).

### B11. Filter groups with HAVING

*Company example data*

WHERE filters rows before they are grouped. `HAVING` filters the groups afterwards, so it can test an aggregate, such as `COUNT(*) > 2`.

The database works in this order: FROM, WHERE, GROUP BY, HAVING, SELECT, ORDER BY. That is why WHERE can not use COUNT(*): the groups do not exist yet.

**Your task.** Show each `city` that has more than 2 employees, with the number of employees as `people`.

### B12. Combine two tables with JOIN

*Company example data*

Data is split across tables so each fact is stored once. `employees.dept_id` holds the `id` of a row in `departments`. Click Map in the Tables area to see this link.

`JOIN ... ON` puts matching rows side by side. Short names for the tables (aliases) keep it readable:

```sql
SELECT e.name, d.name
FROM employees e
JOIN departments d ON e.dept_id = d.id;
```

A plain JOIN (also called INNER JOIN) keeps only rows that found a match.

**Your task.** Show each employee's `name` with the name of their department, as `department`.

### B13. Keep rows with no match: LEFT JOIN

*Company example data*

`LEFT JOIN` keeps every row of the first (left) table, even when nothing matches on the right. The right-hand columns are then NULL.

It answers questions like "which departments have no staff?": join, then keep the rows where the right side is NULL.

```sql
FROM departments d
LEFT JOIN employees e ON e.dept_id = d.id
```

**Your task.** Show the `name` of every department that has no employees.

### B14. Three tables, and a many to many link

*School example data*

A student takes many courses, and a course has many students. A link like that needs a table in the middle: each row of `enrolments` says one student takes one course.

To get from students to courses you join twice, once to the middle table and once from it:

```sql
FROM enrolments e
JOIN students s ON s.id = e.student_id
JOIN courses c ON c.id = e.course_id
```

This lesson uses the School example database.

**Your task.** Show each student's `name`, the `title` of each course they take, and their `grade`, sorted by student name and then course title.

### B15. Choose a value with CASE

*Company example data*

`CASE` works out a value from tests, like "if ... then ... else" in other languages. The first test that is true wins.

```sql
CASE WHEN salary >= 60000 THEN 'high'
     ELSE 'standard'
END AS band
```

**Your task.** Show each employee's `name` and a column `band` that says 'high' when their salary is 60000 or more, and 'standard' otherwise.

### B16. Change data: INSERT, UPDATE and DELETE

*Company example data*

Three statements change data:

- `INSERT INTO departments (id, name, floor) VALUES (5, 'Support', 2);` adds a row.

- `UPDATE employees SET salary = salary + 1000 WHERE id = 3;` changes rows.

- `DELETE FROM orders WHERE id = 1;` removes rows.

Always check the WHERE first: an UPDATE or DELETE without one changes **every** row. The Tables area shows what will change before you run it.

Check my answer starts from fresh data and runs every statement in the Query area, so you can write more than one.

**Your task.** Add a department with `id` 5, `name` 'Support' and `floor` 2. Then move Hugo Martins (employee `id` 8) into it.

## Intermediate

Subqueries, WITH, window functions, views and the questions asked in interviews.

### I1. A query inside a query

*Company example data*

A **subquery** is a query in brackets, used as a value or a list. It runs first, and the outer query uses its answer.

```sql
SELECT name
FROM employees
WHERE salary > (SELECT AVG(salary) FROM employees);
```

With `IN` a subquery gives a list: `WHERE id IN (SELECT employee_id FROM orders)`.

**Your task.** Show the `name` of every employee who has placed at least one order, using `IN` with a subquery.

### I2. Name a step with WITH (a CTE)

*Company example data*

`WITH` gives a query a name before the main query, so you can use it like a table. This is called a common table expression, or CTE. It reads top to bottom, which is easier to follow than a subquery inside a subquery.

```sql
WITH dept_pay AS (
  SELECT dept_id, AVG(salary) AS avg_pay
  FROM employees
  GROUP BY dept_id
)
SELECT ...
FROM employees e
JOIN dept_pay p ON p.dept_id = e.dept_id;
```

How it ran shows the WITH part as its own stage.

**Your task.** Using WITH, show the `name` and `salary` of each employee who earns more than the average of their own department.

### I3. Several steps in a row

*Company example data*

A WITH can hold several named steps, separated by commas. Each one can use the steps before it. This is how longer reports are usually written at work: one small, checkable step at a time.

```sql
WITH a AS (...),
     b AS (SELECT ... FROM a ...)
SELECT ... FROM b;
```

**Your task.** Show the `name` of each employee and their total sales as `total`, only for totals over 2000, biggest first. Use one step to add up the orders per employee and a second to attach the names.

### I4. Number rows in groups: ROW_NUMBER and PARTITION BY

*Company example data*

A **window function** works out a value for each row from other rows around it, without squashing the rows like GROUP BY does. `OVER (...)` says which rows to look at.

```sql
ROW_NUMBER() OVER (PARTITION BY dept_id ORDER BY salary DESC)
```

`PARTITION BY` splits the rows into groups, and `ORDER BY` sorts each group. ROW_NUMBER gives 1, 2, 3 in that order, starting again in each group. `RANK()` is similar, but gives tied rows the same number.

**Your task.** Show each employee's `name`, `dept_id` and their place by salary inside their department, highest first, as `place`. Leave out employees with no department.

### I5. Running totals

*Company example data*

An aggregate with `OVER (ORDER BY ...)` becomes a running total: each row gets the sum of itself and every row before it in that order.

```sql
SUM(amount) OVER (ORDER BY placed_on) AS so_far
```

Running totals and moving averages come up a lot in reporting, for example sales so far this year.

**Your task.** Show each order's `placed_on` date, its `amount`, and the total of all orders up to and including that one as `so_far`, in date order.

### I6. Compare with the row before: LAG

*Library example data*

`LAG(column)` gives the value from the row before, in the window's order. `LEAD` gives the row after. The first row has no row before it, so LAG gives NULL there.

```sql
LAG(out_on) OVER (PARTITION BY borrower ORDER BY out_on)
```

This lesson uses the Library example database.

**Your task.** For each loan, show the `borrower`, the `out_on` date, and the date of that same borrower's previous loan as `previous`. Sort by borrower, then date.

### I7. Group totals on every row

*Company example data*

GROUP BY gives one row per group. A window aggregate keeps every row and puts the group's value next to it, so you can compare each row with its group.

```sql
AVG(salary) OVER (PARTITION BY dept_id) AS dept_avg
```

There is no ORDER BY inside OVER here, so every row in a group gets the same value.

**Your task.** Show each employee's `name`, `salary`, and the average salary of their department as `dept_avg`. Leave out employees with no department.

### I8. Interview classic: the top earner in each group

*Company example data*

"Find the highest paid person in each department" is one of the most common interview questions. A neat answer combines the last two ideas: number the rows inside each group in a WITH step, then keep row 1.

```sql
WITH ranked AS (
  SELECT ..., ROW_NUMBER() OVER (...) AS rn
  FROM ...
)
SELECT ... FROM ranked WHERE rn = 1;
```

You can not write `WHERE ROW_NUMBER() ...` directly, because window functions are worked out after WHERE.

**Your task.** Show the `dept_id`, `name` and `salary` of the highest paid employee in each department. Leave out employees with no department.

### I9. COUNT(*) or COUNT(column) after a LEFT JOIN

*School example data*

After a LEFT JOIN, a row with no match still exists, with NULLs on the right. `COUNT(*)` counts that row, so a course with no students would show 1. `COUNT(e.student_id)` skips NULLs and correctly shows 0.

Getting this right is a small detail that interviewers like to check. This lesson uses the School example database.

**Your task.** Show every course's `title` and how many students take it, as `students`, including courses nobody takes (they should show 0).

### I10. Fill in missing values: COALESCE

*Library example data*

`COALESCE(a, b, ...)` gives the first value that is not NULL. It is the usual way to show a default instead of an empty cell.

```sql
COALESCE(a.name, 'Unknown') AS author
```

This lesson uses the Library example database. One book has no author.

**Your task.** Show every book's `title` and its author's name as `author`, showing 'Unknown' when there is no author.

### I11. Group by month

*Library example data*

Reports often group by month. Dates here are stored as text like `'2026-10-03'`, so the first 7 characters are the month: `SUBSTR(out_on, 1, 7)` gives `'2026-10'`.

Date functions differ between databases: PostgreSQL has `DATE_TRUNC('month', d)`, SQL Server `FORMAT(d, 'yyyy-MM')`, MySQL `DATE_FORMAT(d, '%Y-%m')`. The idea of grouping by the month is the same everywhere.

**Your task.** Show each month as `month` (like 2026-10) and the number of loans that started in it as `loans`, in month order.

### I12. Stack results: UNION, INTERSECT and EXCEPT

*Company example data*

These combine two queries that have the same number of columns:

- `UNION` stacks the rows and removes repeats. `UNION ALL` keeps repeats, and is faster.

- `INTERSECT` keeps rows that are in both.

- `EXCEPT` keeps rows from the first that are not in the second. Oracle calls it `MINUS`.

**Your task.** List the cities that have an employee in department 1 but no employee in department 3.

### I13. Save a query as a view

*School example data*

A **view** is a query saved in the database under a name. After `CREATE VIEW name AS SELECT ...`, you use the name in FROM like a table, and the saved query runs again each time, so the view always shows current data.

Teams use views to share a tricky join once, so everyone else can write simple queries on top. This lesson uses the School example database.

**Your task.** Create a view called `report` with each student's `name`, course `title` and `grade`. Check my answer then reads the view.

### I14. Put it together

*Company example data*

A last task that needs several ideas at once, like a real request at work. Break it into steps, check each one with Run, and use How it ran if a number looks wrong.

Tip: write the WITH steps first and run each on its own, then build the final SELECT on top.

**Your task.** For each department, show its name as `department`, the number of orders placed by its staff as `orders`, and the total order amount as `total`. Include departments with no orders, showing 0 for both. Sort by total, biggest first, then by department name.

## Answers

**B1. Choose columns with SELECT and FROM**

```sql
SELECT
  name,
  city
FROM employees;
```

**B2. All columns, and naming columns with AS**

```sql
SELECT
  name AS department,
  floor
FROM departments;
```

**B3. Keep some rows with WHERE**

```sql
SELECT
  name,
  salary
FROM employees
WHERE salary > 60000;
```

**B4. Combine tests with AND, OR and brackets**

```sql
SELECT
  name,
  city,
  salary
FROM employees
WHERE
  (city = 'Leeds' OR city = 'Manchester')
  AND salary < 60000;
```

**B5. Shortcuts: IN, BETWEEN and LIKE**

```sql
SELECT
  name,
  salary
FROM employees
WHERE salary BETWEEN 50000 AND 60000;
```

**B6. Empty values: NULL**

```sql
SELECT name
FROM employees
WHERE dept_id IS NULL;
```

**B7. Sort with ORDER BY, and keep the first rows with LIMIT**

```sql
SELECT
  name,
  salary
FROM employees
ORDER BY salary DESC
LIMIT 3;
```

**B8. Remove repeats with DISTINCT**

```sql
SELECT DISTINCT city
FROM employees
ORDER BY city;
```

**B9. Count and add up: COUNT, SUM, AVG, MIN, MAX**

```sql
SELECT
  COUNT(*) AS people,
  AVG(salary) AS avg_salary
FROM employees;
```

**B10. One row per group: GROUP BY**

```sql
SELECT
  city,
  COUNT(*) AS people,
  MAX(salary) AS top_salary
FROM employees
GROUP BY city;
```

**B11. Filter groups with HAVING**

```sql
SELECT
  city,
  COUNT(*) AS people
FROM employees
GROUP BY city
HAVING COUNT(*) > 2;
```

**B12. Combine two tables with JOIN**

```sql
SELECT
  e.name,
  d.name AS department
FROM employees e
JOIN departments d
  ON e.dept_id = d.id;
```

**B13. Keep rows with no match: LEFT JOIN**

```sql
SELECT d.name
FROM departments d
LEFT JOIN employees e
  ON e.dept_id = d.id
WHERE e.id IS NULL;
```

**B14. Three tables, and a many to many link**

```sql
SELECT
  s.name,
  c.title,
  e.grade
FROM enrolments e
JOIN students s
  ON s.id = e.student_id
JOIN courses c
  ON c.id = e.course_id
ORDER BY
  s.name,
  c.title;
```

**B15. Choose a value with CASE**

```sql
SELECT
  name,
  CASE WHEN salary >= 60000 THEN 'high' ELSE 'standard' END AS band
FROM employees;
```

**B16. Change data: INSERT, UPDATE and DELETE**

```sql
INSERT INTO departments(id, name, floor)
VALUES (5, 'Support', 2);

UPDATE employees
SET dept_id = 5
WHERE id = 8;
```

**I1. A query inside a query**

```sql
SELECT name
FROM employees
WHERE
  id IN (
    SELECT employee_id
    FROM orders
  );
```

**I2. Name a step with WITH (a CTE)**

```sql
WITH
  dept_pay AS (
    SELECT
      dept_id,
      AVG(salary) AS avg_pay
    FROM employees
    GROUP BY dept_id
  )
SELECT
  e.name,
  e.salary
FROM employees e
JOIN dept_pay p
  ON p.dept_id = e.dept_id
WHERE e.salary > p.avg_pay;
```

**I3. Several steps in a row**

```sql
WITH
  sales AS (
    SELECT
      employee_id,
      SUM(amount) AS total
    FROM orders
    GROUP BY employee_id
  ),
  named AS (
    SELECT
      e.name,
      s.total
    FROM sales s
    JOIN employees e
      ON e.id = s.employee_id
  )
SELECT
  name,
  total
FROM named
WHERE total > 2000
ORDER BY total DESC;
```

**I4. Number rows in groups: ROW_NUMBER and PARTITION BY**

```sql
SELECT
  name,
  dept_id,
  ROW_NUMBER() OVER (PARTITION BY dept_id ORDER BY salary DESC) AS place
FROM employees
WHERE dept_id IS NOT NULL;
```

**I5. Running totals**

```sql
SELECT
  placed_on,
  amount,
  SUM(amount) OVER (ORDER BY placed_on) AS so_far
FROM orders
ORDER BY placed_on;
```

**I6. Compare with the row before: LAG**

```sql
SELECT
  borrower,
  out_on,
  LAG(out_on) OVER (PARTITION BY borrower ORDER BY out_on) AS previous
FROM loans
ORDER BY
  borrower,
  out_on;
```

**I7. Group totals on every row**

```sql
SELECT
  name,
  salary,
  AVG(salary) OVER (PARTITION BY dept_id) AS dept_avg
FROM employees
WHERE dept_id IS NOT NULL;
```

**I8. Interview classic: the top earner in each group**

```sql
WITH
  ranked AS (
    SELECT
      dept_id,
      name,
      salary,
      ROW_NUMBER() OVER (PARTITION BY dept_id ORDER BY salary DESC) AS rn
    FROM employees
    WHERE dept_id IS NOT NULL
  )
SELECT
  dept_id,
  name,
  salary
FROM ranked
WHERE rn = 1;
```

**I9. COUNT(*) or COUNT(column) after a LEFT JOIN**

```sql
SELECT
  c.title,
  COUNT(e.student_id) AS students
FROM courses c
LEFT JOIN enrolments e
  ON e.course_id = c.id
GROUP BY c.title;
```

**I10. Fill in missing values: COALESCE**

```sql
SELECT
  b.title,
  COALESCE(a.name, 'Unknown') AS author
FROM books b
LEFT JOIN authors a
  ON a.id = b.author_id;
```

**I11. Group by month**

```sql
SELECT
  SUBSTR(out_on, 1, 7) AS month,
  COUNT(*) AS loans
FROM loans
GROUP BY SUBSTR(out_on, 1, 7)
ORDER BY month;
```

**I12. Stack results: UNION, INTERSECT and EXCEPT**

```sql
SELECT city
FROM employees
WHERE dept_id = 1
EXCEPT
SELECT city
FROM employees
WHERE dept_id = 3;
```

**I13. Save a query as a view**

```sql
CREATE VIEW report AS
SELECT
  s.name,
  c.title,
  e.grade
FROM enrolments e
JOIN students s
  ON s.id = e.student_id
JOIN courses c
  ON c.id = e.course_id;
```

**I14. Put it together**

```sql
WITH
  per_dept AS (
    SELECT
      e.dept_id,
      COUNT(o.id) AS orders,
      SUM(o.amount) AS total
    FROM employees e
    JOIN orders o
      ON o.employee_id = e.id
    GROUP BY e.dept_id
  )
SELECT
  d.name AS department,
  COALESCE(p.orders, 0) AS orders,
  COALESCE(p.total, 0) AS total
FROM departments d
LEFT JOIN per_dept p
  ON p.dept_id = d.id
ORDER BY
  total DESC,
  department;
```
