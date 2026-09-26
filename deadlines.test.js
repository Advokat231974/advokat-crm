'use strict';
// Тесты движка сроков (раздел 5 ТЗ). Запуск: node deadlines.test.js
// Модуль Deadlines извлекается прямо из advokat_crm.html, чтобы тест
// проверял реальный код, а не его копию.

const fs = require('fs');
const path = require('path');
const vm = require('vm');

const html = fs.readFileSync(path.join(__dirname, 'advokat_crm.html'), 'utf8');
const m = html.match(/const Deadlines = \(\(\) => \{[\s\S]*?\n\}\)\(\);/);
if (!m) throw new Error('Модуль Deadlines не найден в advokat_crm.html — тест не может его проверить.');

const sandbox = {};
vm.createContext(sandbox);
vm.runInContext(m[0] + '\nthis.Deadlines = Deadlines;', sandbox);
const Deadlines = sandbox.Deadlines;

let passed = 0, failed = 0;
function check(name, actual, expected) {
  const ok = JSON.stringify(actual) === JSON.stringify(expected);
  if (ok) { passed++; }
  else {
    failed++;
    console.error(`ПРОВАЛ: ${name}\n  ожидалось: ${JSON.stringify(expected)}\n  получено:  ${JSON.stringify(actual)}`);
  }
}

// Пример из ТЗ п. 5.4: приговор 17.08.2026 (понедельник), 15 суток апелляционного
// срока истекают 01.09.2026 (вторник) — рабочий день, перенос не требуется.
{
  const r = Deadlines.compute('Постановление приговора', '2026-08-17', { value: 15, unit: 'days' }, true, {});
  check('пример ТЗ 5.4: итоговая дата', r.computedDate, '2026-09-01');
  check('пример ТЗ 5.4: перенос не требуется', r.shifted, false);
}

// Переход через год: 20.12.2026 + 15 суток
check('переход через год', Deadlines.addDays('2026-12-20', 15), '2027-01-04');

// Конец месяца короче начала, високосный февраль: 31.01.2028 + 1 месяц (2028 — високосный)
check('месяц: 31 января → 29 февраля, високосный год', Deadlines.addMonths('2028-01-31', 1), '2028-02-29');

// Тот же случай в невисокосном году
check('месяц: 31 января → 28 февраля, невисокосный год', Deadlines.addMonths('2026-01-31', 1), '2026-02-28');

// Истечение в праздник (8 марта 2026 — воскресенье и одновременно праздник): перенос на 9 марта
{
  const calendar = { '2026': { status: 'official', holidays: ['2026-03-08'], workdays: [] } };
  const r = Deadlines.compute('Test', '2026-03-05', { value: 3, unit: 'days' }, true, calendar);
  check('истечение в праздник: перенос выполнен', r.shifted, true);
  check('истечение в праздник: на первый рабочий день', r.computedDate, '2026-03-09');
}

// Истечение в выходной без праздника (6 июня 2026 — суббота): перенос на понедельник
{
  const calendar = { '2026': { status: 'official', holidays: [], workdays: [] } };
  const r = Deadlines.compute('Test', '2026-06-03', { value: 3, unit: 'days' }, true, calendar);
  check('истечение в выходной: перенос на понедельник', r.computedDate, '2026-06-08');
}

// Срок без переноса (ст. 108 УПК): остаётся на выходном, дата не сдвигается
{
  const calendar = { '2026': { status: 'official', holidays: [], workdays: [] } };
  const r = Deadlines.compute('Test', '2026-06-03', { value: 3, unit: 'days' }, false, calendar);
  check('срок без переноса: дата не сдвинута', r.computedDate, '2026-06-06');
  check('срок без переноса: shifted=false', r.shifted, false);
}

// Неподтверждённый календарь блокирует автоматический перенос вместо молчаливой ошибки
{
  const r = Deadlines.compute('Test', '2026-06-03', { value: 3, unit: 'days' }, true, {});
  check('без календаря на год: перенос заблокирован', r.blocked, true);
  check('без календаря на год: дата не выставлена', r.computedDate, null);
}

// Будний день без записи в календаре по-прежнему считается рабочим и не блокирует расчёт
{
  const r = Deadlines.compute('Test', '2026-08-17', { value: 15, unit: 'days' }, true, {});
  check('будний день без календаря: расчёт не заблокирован', r.blocked, false);
}

// Напоминание с отрицательной длительностью (окончание содержания под стражей)
check('отрицательная длительность — напоминание заранее', Deadlines.addDays('2026-09-15', -10), '2026-09-05');

console.log(`\n${passed} пройдено, ${failed} провалено`);
if (failed) process.exit(1);
