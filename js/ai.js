// ============================================================
// VITAASCEND — AI Insights Module (ai.js)
// Handles connection to Google Gemini API for personalized 
// strategic insights.
// ============================================================

const AI = (() => {
    const GEMINI_API_KEY = 'AIzaSyAP5nJ5DwK5Yoedj70-Oscp3FqSS08-KZA';
    const GEMINI_API_URL = 'https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent';

    /**
     * Get API key
     */
    function getApiKey() {
        return GEMINI_API_KEY;
    }

    /**
     * Generate an insight based on user data
     */
    async function generateInsight(userData) {
        const apiKey = getApiKey();
        if (!apiKey) {
            throw new Error("API Key não fornecida.");
        }

        const prompt = buildPrompt(userData);

        try {
            const response = await fetch(`${GEMINI_API_URL}?key=${apiKey}`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({
                    contents: [{
                        parts: [{ text: prompt }]
                    }],
                    systemInstruction: {
                        parts: [{
                            text: "Você é a 'Strategic AI', uma IA avançada e direta de análise de performance do projeto VitaAscend. Fale apenas o essencial, focado em alta performance. Seja breve (no máximo 2 ou 3 frases médias). Não use saudações, vá direto ao insight, focando no pior ou melhor hábito do usuário para maximizar o PDL (Performance Discipline Level). Se os dados forem insuficientes, recomende consistência."
                        }]
                    },
                    generationConfig: {
                        temperature: 0.7,
                        maxOutputTokens: 150
                    }
                })
            });

            if (!response.ok) {
                const errData = await response.json();
                throw new Error(errData.error?.message || "Erro na API Gemini.");
            }

            const data = await response.json();

            if (data.candidates && data.candidates.length > 0) {
                return data.candidates[0].content.parts[0].text;
            } else {
                throw new Error("Resposta vazia da IA.");
            }

        } catch (error) {
            console.error("AI Error:", error);
            throw error;
        }
    }

    /**
     * Compile user data into a clean text prompt
     */
    function buildPrompt(userData) {
        const { habits, logs, efficiency, streak } = userData;

        let prompt = `Analise a performance do operador logado:\n\n`;
        prompt += `- Eficiência Média Recente (PDL Index): ${efficiency}%\n`;
        prompt += `- Maior Streak Atual Global: ${streak} dias\n\n`;

        prompt += `Hábitos Registrados (Status Atual):\n`;
        habits.forEach(h => {
            // Calculate recent completion rate for this habit (last 7 days if possible)
            const habitLogs = logs.filter(l => l.habit_id === h.id);
            const comps = habitLogs.filter(l => l.completed).length;
            prompt += `- [${h.title}] (Categoria: ${h.category}): Feito ${comps} vezes recentemente. Streak atual: ${h.streak} dias.\n`;
        });

        prompt += `\nCom base nisso, qual a "Janela de Performance" ou o maior gargalo/oportunidade que devo focar amanhã para subir meu rank competitivo?`;

        return prompt;
    }

    return {
        generateInsight
    };
})();

window.AI = AI;
