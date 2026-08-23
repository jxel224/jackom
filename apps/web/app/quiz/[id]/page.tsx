import { QuizGame } from '../../../components/quiz/QuizGame';
export default async function QuizGamePage({params}:{params:Promise<{id:string}>}){const {id}=await params;return <QuizGame id={id}/>}
