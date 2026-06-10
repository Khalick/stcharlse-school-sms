import type { StudyMaterial, Student } from '../data/mockDb';
import { apiClient } from '../data/apiClient';

export interface QuizQuestion {
  question: string;
  options: string[];
  correctIndex: number;
  explanation: string;
}

// Pre-baked high-fidelity quizzes for seed materials
const SEED_QUIZZES: Record<string, QuizQuestion[]> = {
  'M001': [
    {
      question: 'Which organ acts as a filtration machine and produces bile?',
      options: ['Stomach', 'Pancreas', 'Liver', 'Salivary Glands'],
      correctIndex: 2,
      explanation: 'The liver cleans toxins from the blood and produces bile to break down fats.'
    },
    {
      question: 'Where does digestion begin in the human body?',
      options: ['In the stomach', 'In the esophagus', 'In the small intestine', 'In the mouth'],
      correctIndex: 3,
      explanation: 'Digestion begins in the mouth where food is chewed and mixed with saliva.'
    },
    {
      question: 'What is the semi-liquid mixture of food and gastric juices in the stomach called?',
      options: ['Chyme', 'Bolus', 'Feces', 'Starch'],
      correctIndex: 0,
      explanation: 'The stomach churns food into a semi-liquid mixture called chyme.'
    }
  ],
  'M002': [
    {
      question: 'Which tool is designed to tighten or loosen screws and must match flathead or Phillips slots?',
      options: ['Pliers', 'Hammer', 'Screwdriver', 'Handsaw'],
      correctIndex: 2,
      explanation: 'Screwdrivers are specifically matched to screw slots to turn them.'
    },
    {
      question: 'What is Rule 1 of workshop safety?',
      options: [
        'Keep tools clean and stored',
        'Always wear Personal Protective Equipment (PPE)',
        'Report broken tools immediately',
        'Never play in the workshop'
      ],
      correctIndex: 1,
      explanation: 'Wearing Personal Protective Equipment (PPE) like goggles and safety shoes is the first rule of workshop safety.'
    },
    {
      question: 'Why should you never use pliers to turn nuts?',
      options: [
        'It damages the pliers only',
        'You should use a wrench instead to prevent slipping and stripping',
        'Pliers are only for cutting wood',
        'Nuts can only be tightened by hand'
      ],
      correctIndex: 1,
      explanation: 'Using a wrench is the correct method; pliers can easily slip and strip the hexagonal edges of a nut.'
    }
  ],
  'M003': [
    {
      question: 'What is the sequence of events that makes up a story called?',
      options: ['Setting', 'Plot', 'Theme', 'Climax'],
      correctIndex: 1,
      explanation: 'The plot refers to the chronological or logical sequence of events in a narrative.'
    },
    {
      question: 'Which section of a narrative essay features the build-up of events and tension?',
      options: ['The Introduction', 'The Climax', 'The Rising Action', 'The Resolution'],
      correctIndex: 2,
      explanation: 'The Rising Action is where conflicts begin to develop, building up tension towards the turning point.'
    },
    {
      question: 'What is the Climax of a story?',
      options: [
        'The opening hook that grabs attention',
        'The turning point where tension reaches its peak',
        'The scene that describes the physical setting',
        'The paragraph where the moral is explained'
      ],
      correctIndex: 1,
      explanation: 'The Climax is the emotional peak or turning point of the narrative essay.'
    }
  ]
};

/**
 * Gets practice quiz questions based on the active material.
 */
export function getQuizForMaterial(material: StudyMaterial): QuizQuestion[] {
  if (SEED_QUIZZES[material.id]) {
    return SEED_QUIZZES[material.id];
  }
  
  // Generic fallback quiz for new uploaded files
  return [
    {
      question: `What is the primary topic of the document "${material.title}"?`,
      options: [
        `It discusses ${material.subject} concepts`,
        'It is an math formula book',
        'It covers high school chemistry only',
        'It is a sport timetable'
      ],
      correctIndex: 0,
      explanation: `The material explicitly covers curriculum notes on ${material.subject}.`
    },
    {
      question: `Who is the author of this notes set?`,
      options: ['The principal', 'A student peer', material.author, 'An external editor'],
      correctIndex: 2,
      explanation: `The study sheet was uploaded and structured by ${material.author}.`
    },
    {
      question: `What grade level is this resource flagged for?`,
      options: [material.grade, 'Grade 1', 'University level', 'Kindergarten'],
      correctIndex: 0,
      explanation: `This document is tagged for study in ${material.grade}.`
    }
  ];
}

/**
 * Simulates Charlie AI answering a student question contextually.
 */
export async function generateAiResponse(
  query: string, 
  material: StudyMaterial, 
  student: Student
): Promise<string> {
  try {
    const data = await apiClient.post<{ response: string }>('/ai/chat', { query, materialId: material.id });
    return data.response;
  } catch (error) {
    console.warn('Charlie AI live API query failed, falling back to mock response:', error);
    return new Promise((resolve) => {
      setTimeout(() => {
        const q = query.toLowerCase();
        let response = '';

        if (q.includes('hello') || q.includes('hi') || q.startsWith('who are you')) {
          response = `Hello ${student.name}! I am Charlie, your AI Study Companion. I am here to help you study **${material.title}**. Ask me any questions about the notes, and we can learn together!`;
          resolve(response);
          return;
        }

        if (material.id === 'M001') {
          if (q.includes('liver') || q.includes('bile')) {
            response = `![Diagram of the Liver](https://image.pollinations.ai/prompt/highly-detailed-educational-diagram-of-the-human-liver-kid-friendly-science?width=800&height=400&nologo=true)\n\nGreat question, ${student.name}! The **liver** is like a filtration factory in your body. It cleans out toxins from your blood so you stay healthy. It also produces a special liquid called **bile** (stored in the gallbladder) which helps break down fats from food so enzymes can digest them easily.`;
          } else if (q.includes('stomach') || q.includes('chyme')) {
            response = `![Diagram of the Stomach](https://image.pollinations.ai/prompt/highly-detailed-educational-diagram-of-the-human-stomach-kid-friendly-science?width=800&height=400&nologo=true)\n\nAha! The **stomach** is a powerful muscular sac. It uses hydrochloric acid and pepsin enzymes to digest food. It churns everything together into a semi-liquid mixture called **chyme** before squeezing it into the small intestine.`;
          } else if (q.includes('mouth') || q.includes('esophagus') || q.includes('start') || q.includes('begin')) {
            response = `Digestion starts the moment you take a bite, ${student.name}! In your **mouth**, teeth chew food and saliva breaks down starch. When you swallow, the food bolus travels down the **esophagus** through wave-like muscular contractions called *peristalsis*.`;
          } else if (q.includes('intestine')) {
            response = `The intestines are very important! The **small intestine** does most of the heavy lifting for digesting food and absorbing nutrients into your bloodstream. The **large intestine** absorbs water and salts, turning whatever is left into solid waste.`;
          } else {
            response = `![Diagram of the Digestive System](https://image.pollinations.ai/prompt/highly-detailed-educational-diagram-of-the-human-digestive-system-organs-with-labels-kid-friendly-science?width=800&height=400&nologo=true)\n\nInteresting question, ${student.name}! Based on our Science notes, the digestive system breaks down food so your body can absorb energy. In these notes, we see the mouth, esophagus, stomach, liver, and intestines working together. Is there a specific organ you would like me to explain further?`;
          }
        } else if (material.id === 'M002') {
          if (q.includes('safety') || q.includes('rule')) {
            response = `Safety is number one in the workshop, ${student.name}! The notes outline key rules: 
  1. Always wear **PPE** (safety goggles, closed shoes, and aprons).
  2. Store tools in their correct places.
  3. Keep floors clean of spills.
  4. Report any broken tools to Teacher Beatrice immediately. Which rule should we practice?`;
          } else if (q.includes('hammer') || q.includes('screwdriver') || q.includes('pliers') || q.includes('saw')) {
            response = `Let's talk about tools! The notes list:
  - **Hammers** (for driving nails; make sure the head is tight!)
  - **Screwdrivers** (for flathead or Phillips screws)
  - **Pliers** (for gripping/bending wires; *never* use them on nuts—use a wrench!)
  - **Saws** (for cutting; always saw *away* from your body). 
  Remember to use the correct tool for the job!`;
          } else if (q.includes('nut') || q.includes('wrench')) {
            response = `Correct, ${student.name}! According to the notes, you should **never use pliers to turn nuts**. You must use a **wrench** instead. This is because pliers can slip and strip the flat edges of the nut, making it impossible to remove later!`;
          } else {
            response = `I hear you, ${student.name}. In our Pre-Tech study sheet on Hand Tools, Teacher Beatrice stresses proper tool usage and workshop safety rules. We want to avoid accidents and protect our equipment. Ask me about a specific tool or safety rule!`;
          }
        } else if (material.id === 'M003') {
          if (q.includes('climax') || q.includes('peak') || q.includes('turning')) {
            response = `The **climax** is the most exciting part, ${student.name}! It is the turning point of the story where the conflict or main problem reaches its absolute peak. Think of it as the big showdown in a movie before things start settling down.`;
          } else if (q.includes('plot') || q.includes('elements') || q.includes('setting')) {
            response = `To write a great story, we need the core elements:
  1. **Plot**: The order of events.
  2. **Setting**: The time and place (like Thika Kiganjo during the rains!).
  3. **Characters**: The people.
  4. **Theme**: The message or moral.
  Which element would you like to explore next?`;
          } else if (q.includes('rising') || q.includes('falling') || q.includes('action')) {
            response = `Great attention to structure! **Rising Action** is the build-up where problems grow and tension increases. **Falling Action** occurs *after* the climax, showing the results of the turning point as the story moves toward the resolution.`;
          } else if (q.includes('introduction') || q.includes('hook') || q.includes('start')) {
            response = `Starting is key, ${student.name}! The **Introduction** sets the scene, introduces characters, and uses a **hook** (an exciting sentence or question) to grab the reader's interest so they keep reading.`;
          } else {
            response = `Excellent, ${student.name}. In this English workbook, Teacher Mark details how to structure a narrative essay: Introduction, Rising Action, Climax, Falling Action, and Resolution. What part of the structure should we focus on?`;
          }
        } else {
          response = `Hello ${student.name}! I have reviewed the document "${material.title}" by ${material.author}. It is about ${material.subject} for ${material.grade}. What specific part of this document can I explain for you?`;
        }

        resolve(response);
      }, 800);
    });
  }
}
