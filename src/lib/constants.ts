export const SCHOOL_STREAMS = [
  'Play Group Mourine',
  'Play Group Gachira',
  'Play Group Salome',
  'PP1 Munene',
  'PP1 Ann',
  'PP1 Fresha',
  'PP2 Carol',
  'PP2 Mary',
  'PP2 Triza',
  'Grade 1 East',
  'Grade 1 West',
  'Grade 1 North',
  'Grade 2 East',
  'Grade 2 West',
  'Grade 2 North',
  'Grade 3 East',
  'Grade 3 West',
  'Grade 3 North',
  'Grade 4 East',
  'Grade 4 West',
  'Grade 4 North',
  'Grade 4 South',
  'Grade 5 East',
  'Grade 5 West',
  'Grade 5 North',
  'Grade 5 South',
  'Grade 6 East',
  'Grade 6 West',
  'Grade 6 North',
  'Grade 7 Batian',
  'Grade 7 Lenana',
  'Grade 7 Nelion',
  'Grade 8 Lenana',
  'Grade 8 Batian',
  'Grade 9 Lenana',
  'Grade 9 Batian'
];

export const PRE_PRIMARY_SUBJECTS = [
  'Language Activities',
  'Mathematical Activities',
  'Environmental Activities',
  'Psychomotor and Creative Activities',
  'Religious Education Activities'
];

export const LOWER_PRIMARY_SUBJECTS = [
  'Mathematical Activities',
  'English Language Activities',
  'Kiswahili Language Activities',
  'Indigenous Language Activities',
  'Hygiene and Nutrition Activities',
  'Environmental Activities',
  'Religious Education Activities',
  'Movement and Creative Activities'
];

export const UPPER_PRIMARY_SUBJECTS = [
  'Mathematics',
  'English',
  'Kiswahili',
  'Science and Technology',
  'Agriculture and Nutrition',
  'Social Studies',
  'Religious Education',
  'Creative Arts',
  'Physical and Health Education'
];

export const JUNIOR_SECONDARY_SUBJECTS = [
  'Mathematics',
  'English',
  'Kiswahili',
  'Integrated Science',
  'Social Studies',
  'Pre-Technical and Pre-Career Studies',
  'Religious Education',
  'Health Education',
  'Creative Arts and Sports',
  'Foreign Languages',
  'Indigenous Languages'
];

/**
 * Returns the official CBC subjects given a specific grade name or number.
 */
export function getSubjectsForGrade(gradePrefix: string | number): string[] {
  const gStr = String(gradePrefix).toLowerCase();

  // Pre-Primary
  if (gStr.includes('play group') || gStr.includes('pp1') || gStr.includes('pp2')) {
    return PRE_PRIMARY_SUBJECTS;
  }
  
  // Lower Primary (1, 2, 3)
  if (gStr.includes('grade 1') || gStr.includes('grade 2') || gStr.includes('grade 3') || ['1','2','3'].includes(gStr)) {
    return LOWER_PRIMARY_SUBJECTS;
  }

  // Upper Primary (4, 5, 6)
  if (gStr.includes('grade 4') || gStr.includes('grade 5') || gStr.includes('grade 6') || ['4','5','6'].includes(gStr)) {
    return UPPER_PRIMARY_SUBJECTS;
  }

  // Junior Secondary (7, 8, 9)
  if (gStr.includes('grade 7') || gStr.includes('grade 8') || gStr.includes('grade 9') || ['7','8','9'].includes(gStr)) {
    return JUNIOR_SECONDARY_SUBJECTS;
  }

  return []; // Fallback
}
