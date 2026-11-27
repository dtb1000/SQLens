// The example databases offered on the welcome page. Plain SQL that works on SQLite (and PostgreSQL).
const company = require('./seed');

const school = `
CREATE TABLE students (id INTEGER PRIMARY KEY, name VARCHAR(60) NOT NULL, year INTEGER NOT NULL, tutor VARCHAR(60));
INSERT INTO students VALUES
 (1,'Ada Mensah',1,'Dr Shah'),(2,'Bilal Rahman',1,'Dr Shah'),(3,'Chloe Martin',2,'Ms Okoro'),(4,'Dev Patel',2,NULL),
 (5,'Eva Novak',3,'Ms Okoro'),(6,'Finn Walsh',3,'Dr Shah'),(7,'Gia Rossi',1,NULL),(8,'Hana Sato',2,'Ms Okoro');
CREATE TABLE courses (id INTEGER PRIMARY KEY, title VARCHAR(80) NOT NULL UNIQUE, credits INTEGER DEFAULT 10, room CHAR(4));
INSERT INTO courses VALUES (1,'Databases',20,'B204'),(2,'Statistics',10,'A101'),(3,'Web Design',10,'B110'),(4,'Ethics',5,NULL),(5,'Networks',20,'C002');
CREATE TABLE enrolments (student_id INTEGER NOT NULL REFERENCES students(id), course_id INTEGER NOT NULL REFERENCES courses(id),
 grade INTEGER, PRIMARY KEY (student_id, course_id));
INSERT INTO enrolments VALUES
 (1,1,72),(1,2,65),(2,1,58),(2,3,81),(3,1,90),(3,2,77),(3,4,NULL),(4,3,49),(5,1,84),(5,2,69),(5,3,73),
 (6,4,62),(7,1,NULL),(7,3,55),(8,2,88),(8,4,71);
`;

const library = `
CREATE TABLE authors (id INTEGER PRIMARY KEY, name VARCHAR(60) NOT NULL, country VARCHAR(40));
INSERT INTO authors VALUES (1,'Amara Lowe','Ghana'),(2,'Bruno Keller','Germany'),(3,'Clara Ibsen','Norway'),(4,'Dina Haddad','Lebanon'),(5,'Emil Varga',NULL);
CREATE TABLE books (id INTEGER PRIMARY KEY, title VARCHAR(100) NOT NULL, author_id INTEGER REFERENCES authors(id), published INTEGER, pages INTEGER);
INSERT INTO books VALUES
 (1,'The Salt Road',1,2011,320),(2,'Night Ferry',2,2015,212),(3,'Glass Orchard',1,2019,401),(4,'Small Hours',3,2008,188),
 (5,'Cedar and Stone',4,2021,276),(6,'Paper Kites',3,2016,240),(7,'The Quiet Map',2,2023,350),(8,'Unsigned',NULL,1999,150);
CREATE TABLE loans (id INTEGER PRIMARY KEY, book_id INTEGER NOT NULL REFERENCES books(id), borrower VARCHAR(60) NOT NULL,
 out_on CHAR(10) NOT NULL, back_on CHAR(10));
INSERT INTO loans VALUES
 (1,1,'Priya','2026-09-02','2026-09-20'),(2,3,'Tom','2026-09-05','2026-09-30'),(3,2,'Priya','2026-09-21','2026-10-04'),
 (4,1,'Lena','2026-10-01',NULL),(5,5,'Tom','2026-10-03','2026-10-18'),(6,6,'Sam','2026-10-11',NULL),(7,3,'Lena','2026-10-20','2026-11-02'),
 (8,7,'Priya','2026-11-01',NULL),(9,5,'Sam','2026-11-05',NULL),(10,1,'Tom','2026-11-10',NULL);
`;

module.exports = { company, school, library };
