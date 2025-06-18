// Файл: src/ml/scaling-model.js

// Цей файл відповідає за створення, тренування та використання ML-моделі.

let model;
const SEQUENCE_LENGTH = 10; // Скільки попередніх значень аналізувати для прогнозу.

/**
 * Генерує синтетичні дані для тренування.
 * Ми створюємо синусоїду з невеликим шумом, щоб імітувати
 * циклічне денне/нічне навантаження на сервери.
 */
function generateTrainingData() {
    const data = [];
    // Згенеруємо 200 точок даних
    for (let i = 0; i < 200; i++) {
        // Синусоїда в діапазоні [0, 1] + невеликий випадковий шум
        const value = Math.sin(i / 15) * 0.5 + 0.5 + (Math.random() - 0.5) * 0.1;
        data.push(Math.max(0, Math.min(1, value))); // Обмежимо значення в [0, 1]
    }

    const xs_data = []; // Вхідні дані (послідовності)
    const ys_data = []; // Вихідні дані (наступне значення)

    // Створюємо набір даних для навчання: [1,2,3] -> [4], [2,3,4] -> [5] і т.д.
    for (let i = 0; i < data.length - SEQUENCE_LENGTH; i++) {
        xs_data.push(data.slice(i, i + SEQUENCE_LENGTH));
        ys_data.push(data[i + SEQUENCE_LENGTH]);
    }

    // Перетворюємо масиви JavaScript в тензори TensorFlow.js
    return {
        xs: tf.tensor2d(xs_data),
        ys: tf.tensor1d(ys_data)
    };
}

/**
 * Створює та компілює нейронну мережу.
 * Ми використовуємо LSTM-мережу, яка добре підходить для аналізу послідовностей.
 * @returns {Promise<tf.Sequential>} - Натренована модель
 */
export async function createAndTrainModel() {
    console.log("Починаємо створення та тренування ML-моделі...");

    // Створюємо послідовну модель
    model = tf.sequential();
    
    // Додаємо шар LSTM. Це ключовий шар для роботи з часовими рядами.
    model.add(tf.layers.lstm({
        units: 16, // Кількість нейронів у шарі
        inputShape: [SEQUENCE_LENGTH, 1] // Очікувана форма вхідних даних
    }));
    
    // Додаємо вихідний шар, який дасть одне числове значення (прогноз).
    model.add(tf.layers.dense({ units: 1 }));

    // Компілюємо модель: вказуємо оптимізатор та функцію втрат.
    model.compile({
        optimizer: 'adam',
        loss: 'meanSquaredError' // Середньоквадратична помилка - стандарт для регресії
    });

    const { xs, ys } = generateTrainingData();
    // LSTM очікує 3D-тензор [кількість_прикладів, довжина_послідовності, кількість_ознак]
    const xs_reshaped = xs.reshape([xs.shape[0], xs.shape[1], 1]);

    // Тренуємо модель
    await model.fit(xs_reshaped, ys, {
        epochs: 40, // Кількість епох тренування
        callbacks: {
            onEpochEnd: (epoch, logs) => {
                console.log(`Епоха ${epoch + 1}: Втрати = ${logs.loss.toFixed(4)}`);
            }
        }
    });

    console.log("ML-модель успішно натренована!");
    // Очищуємо пам'ять, видаляючи тензори, які більше не потрібні
    xs.dispose();
    ys.dispose();
    xs_reshaped.dispose();
    
    return model;
}

/**
 * Прогнозує наступне значення навантаження.
 * @param {Array<number>} sequence - Масив останніх значень навантаження (довжиною SEQUENCE_LENGTH)
 * @returns {Promise<number | null>} - Прогнозоване значення, або null, якщо даних недостатньо
 */
export async function predictLoad(sequence) {
    if (!model) {
        throw new Error("Модель ще не натренована!");
    }
    if (sequence.length !== SEQUENCE_LENGTH) {
        return null; // Недостатньо даних для прогнозу
    }

    // tf.tidy() автоматично очищує пам'ять від проміжних тензорів
    return tf.tidy(() => {
        // Перетворюємо вхідний масив у тензор потрібної форми
        const input = tf.tensor2d([sequence]).reshape([1, SEQUENCE_LENGTH, 1]);
        const prediction = model.predict(input);
        // Повертаємо результат як звичайне число
        return prediction.dataSync()[0];
    });
}