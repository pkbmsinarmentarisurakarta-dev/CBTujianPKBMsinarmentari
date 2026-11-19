export type UserRole = 'ADMIN' | 'SISWA';

export interface AuthUser {
  profileId: string;
  schoolId: string;
  role: UserRole;
  username: string;
  email?: string;
  fullName: string;
  studentId?: string | null;
  nis?: string | null;
  classId?: string | null;
  className?: string | null;
  schoolName: string;
  schoolLogo?: string;
  activeAcademicYear?: string;
  activeSemester?: string;
  appTitle?: string;
}

export interface School {
  id: string;
  npsn: string;
  name: string;
  level: 'SD/MI' | 'SMP/MTs' | 'SMA/MA' | 'SMK' | 'PKBM' | 'Lembaga';
  address: string;
  phone: string;
  email: string;
  principal_name: string;
  logo_url: string;
  app_title: string;
  active_academic_year: string;
  active_semester: 'Ganjil' | 'Genap';
}

export interface SchoolClass {
  id: string;
  school_id: string;
  academic_year_label: string;
  name: string;
  grade_level: string;
  major: string;
  homeroom_teacher: string;
  student_count?: number;
}

export interface Student {
  id: string;
  school_id: string;
  profile_id: string;
  class_id: string | null;
  class_name?: string;
  nis: string;
  nisn: string;
  full_name: string;
  gender: 'L' | 'P' | '';
  username: string;
  status: 'aktif' | 'nonaktif';
  is_active: number;
  last_login_at?: string;
}

export interface Subject {
  id: string;
  code: string;
  name: string;
  category: string;
  description: string;
  question_count?: number;
}

export type QuestionType = 'single_choice' | 'multiple_choice' | 'true_false' | 'short_answer' | 'essay';
export type DifficultyLevel = 'mudah' | 'sedang' | 'sulit';

export interface QuestionOption {
  id?: string;
  option_label: string;
  content_html: string;
  image_url?: string;
  is_correct: boolean | number;
  sort_order?: number;
}

export interface Question {
  id: string;
  bank_id?: string | null;
  subject_id: string;
  subject_name?: string;
  subject_code?: string;
  grade_level: string;
  question_type: QuestionType;
  difficulty: DifficultyLevel;
  content_html: string;
  latex_formula: string;
  image_url: string;
  image_width: string;
  table_json: string;
  correct_answer_text: string;
  answer_rules_json: string;
  weight: number;
  explanation: string;
  options: QuestionOption[];
}

export type ExamStatus = 'draft' | 'terjadwal' | 'aktif' | 'selesai' | 'diarsipkan';

export interface Exam {
  id: string;
  subject_id: string;
  subject_name?: string;
  class_id: string | null;
  class_name?: string;
  title: string;
  exam_type: string;
  academic_year: string;
  semester: 'Ganjil' | 'Genap';
  description: string;
  exam_date: string;
  start_time: string;
  end_time: string;
  duration_minutes: number;
  question_count: number;
  attached_question_count?: number;
  participant_count?: number;
  passing_score: number;
  rounding_mode: 'none' | 'nearest_int' | 'one_decimal' | 'two_decimals';
  exam_token: string;
  max_attempts: number;
  shuffle_questions: number | boolean;
  shuffle_options: number | boolean;
  questions_per_page: number;
  results_published: number | boolean;
  status: ExamStatus;
}
