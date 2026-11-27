// Sample data for the built-in practice database. Plain SQL that works on SQLite.
module.exports = `
CREATE TABLE departments (id INTEGER PRIMARY KEY, name VARCHAR(40) NOT NULL UNIQUE, floor INTEGER DEFAULT 1);
INSERT INTO departments VALUES (1,'Engineering',3),(2,'Sales',1),(3,'Design',2),(4,'Legal',4);
CREATE TABLE employees (id INTEGER PRIMARY KEY, name VARCHAR(60) NOT NULL, dept_id INTEGER REFERENCES departments(id), salary INTEGER, city VARCHAR(40));
INSERT INTO employees VALUES
 (1,'Amara Okafor',1,72000,'Leeds'),(2,'Ben Hughes',2,48000,'Manchester'),(3,'Chen Wei',1,81000,'London'),
 (4,'Dana Kowalski',3,55000,'Leeds'),(5,'Elif Demir',2,52000,'London'),(6,'Farid Haddad',1,64000,'Manchester'),
 (7,'Grace Lin',3,59000,'London'),(8,'Hugo Martins',NULL,45000,'Leeds'),(9,'Isla Brown',2,61000,'Leeds');
CREATE TABLE orders (id INTEGER PRIMARY KEY, employee_id INTEGER NOT NULL REFERENCES employees(id), amount DECIMAL(10,2), placed_on CHAR(10));
INSERT INTO orders VALUES
 (1,2,1200,'2026-09-03'),(2,5,800,'2026-09-05'),(3,9,2300,'2026-09-11'),(4,2,450,'2026-09-18'),(5,9,1750,'2026-10-02'),
 (6,5,3100,'2026-10-09'),(7,2,960,'2026-10-15'),(8,9,600,'2026-10-28'),(9,1,300,'2026-11-04'),(10,5,1400,'2026-11-12');
`;
