# Assignment Import - Complete Feature Guide

## Overview
The Assignment Import feature supports comprehensive matching logic with email-only entries, student transfers, and visual status indicators.

## Matching Priority

### For Peer Tutors and Students:

1. **Priority 1: Name Match (if provided)**
   - Attempts exact match using the provided name (case-insensitive)
   - If found, returns immediately

2. **Priority 2: Email Match (fallback or primary)**
   - If name fails OR only email is provided, tries email matching
   - Email matching is case-insensitive
   - If found, returns the match

3. **Not Found**
   - If both methods fail, entity is marked as "NOT FOUND"

## Excel File Format

Your Excel file should have these columns (all optional, but at least ONE identifier required per entity):

- **Peer Tutor Name** (Optional - but recommended)
- **Peer Tutor Email** (Optional - but recommended)
- **Student Name** (Optional - but recommended)
- **Student Email** (Optional - but recommended)

**Requirements:**
- At least ONE identifier (name OR email) for peer tutor
- At least ONE identifier (name OR email) for student

## Visual Indicators

### Peer Tutor PFP:
- **Background:** Gray (`bg-gray-300`)
- **Text:** Black (`text-gray-900`)

### Student PFP:
- **Background:** Black (`bg-gray-900`)
- **Text:** Gray (`text-gray-300`)

### Peer Tutor Status Badges:

| Status | Badge Color | Icon | Meaning |
|--------|-------------|------|---------|
| **ALREADY EXISTS** | Gray | ✓ | Peer tutor found in system |
| **NEW** | Blue | ➕ | New peer tutor will be created |
| **NOT FOUND** | Red | ⚠️ | Peer tutor not in system |

### Student Status Badges:

| Status | Badge Color | Icon | Meaning |
|--------|-------------|------|---------|
| **Already Assigned** | Gray | - | Student already assigned to this peer tutor |
| **➕ New Assignment** | Blue | ➕ | New assignment will be created |
| **🔄 TRANSFER** | Amber | 🔄 | Student will be transferred from another peer tutor |
| **❌ NOT FOUND** | Red | ❌ | Student not found in system |

## Statistics Dashboard

The preview shows 5 key metrics:

1. **Total Peer Tutors** - Total unique peer tutors in file
2. **Found Tutors** (Green) - Peer tutors already in system
3. **Not Found Tutors** (Red) - Peer tutors missing from system
4. **New Assignments** (Blue) - New student-tutor assignments
5. **Transfers** (Amber) - Students being reassigned between tutors

## Matching Examples

### Example 1: Email-Only Entry
```
Excel Row:
- Peer Tutor Name: (empty)
- Peer Tutor Email: "john.doe@example.com"
- Student Name: (empty)
- Student Email: "jane.smith@example.com"

Result:
✅ Both found by email
Display names will use actual names from database
```

### Example 2: Name-Only Entry
```
Excel Row:
- Peer Tutor Name: "John Doe"
- Peer Tutor Email: (empty)
- Student Name: "Jane Smith"
- Student Email: (empty)

Result:
✅ Both found by name (if they exist)
```

### Example 3: Student Transfer
```
Current State:
- Student "Alice" is assigned to Peer Tutor "Bob"

Excel Row:
- Peer Tutor Name: "Charlie"
- Student Name: "Alice"

Result:
🔄 TRANSFER status shown
"Transfer from: Bob" displayed
Alice will be reassigned from Bob to Charlie
```

### Example 4: New Peer Tutor with Existing Students
```
Excel Row:
- Peer Tutor Name: "New Tutor"
- Peer Tutor Email: "new@example.com"
- Student Name: "Existing Student"

Result:
Peer Tutor: "NEW" badge (blue)
Student: "➕ New Assignment" badge (blue)
Both will be processed together
```

## Student Transfer Detection

The system automatically detects when a student is being reassigned:

1. **Checks current assignment**: Looks at `student.assigned_peer_tutor_id`
2. **Compares with new assignment**: If different from target peer tutor
3. **Shows transfer status**: 
   - 🔄 TRANSFER badge
   - "Transfer from: [Current Tutor Name]" message
4. **On import**: Reassigns student to new peer tutor

## Workflow

### 1. Upload Excel File
- Select your Excel file
- System processes and matches all entries
- Supports email-only, name-only, or both

### 2. Review Preview
- Check statistics dashboard (5 metrics)
- Review each peer tutor section
- Identify statuses:
  - Gray: Already exists
  - Blue: New
  - Red: Not found
  - Amber: Transfers

### 3. Handle Missing Entities (if any)
- Click "ADD MISSING ENTITIES"
- System creates missing peer tutors and students
- Auto-generates emails if not provided

### 4. Import Assignments
- Click "IMPORT ASSIGNMENTS"
- System processes:
  - New assignments
  - Student transfers
  - Skips existing assignments
- Shows detailed summary

## Import Summary

After import, you'll see:
```
Import complete!
X new assignment(s)
Y transfer(s)
Z skipped (already assigned)
```

## Console Logging

Debug logs show matching process:

```
✅ Peer Tutor found by NAME: "John Doe" → John Doe (john@example.com)
✅ Student found by EMAIL: "jane@example.com" → Jane Smith (jane@example.com)
❌ Peer Tutor NOT FOUND: Email="unknown@example.com"
❌ Student NOT FOUND: Name="Unknown Student"
```

## Best Practices

1. **Provide both name and email** - Increases match accuracy
2. **Use email-only for flexibility** - Works when names might vary
3. **Review transfers carefully** - Ensure students are being moved correctly
4. **Check "NOT FOUND" entries** - Add missing entities before importing
5. **Monitor console logs** - Helps debug matching issues

## Advanced Features

### Email-Only Matching
- No name required
- System finds by email alone
- Display name uses database value

### Smart Display Names
- If entity found: Uses actual name from database
- If not found: Uses provided name or email
- Never shows "Unknown" unless both are missing

### Transfer Handling
- Detects existing assignments
- Shows source peer tutor
- Reassigns on import
- Preserves historical data (old records remain)

### Flexible Input
- Name optional if email provided
- Email optional if name provided
- At least ONE identifier required
- Works with any combination

## Color Coding Summary

| Element | Background | Text | Purpose |
|---------|-----------|------|---------|
| Peer Tutor PFP | Gray | Black | Consistent identification |
| Student PFP | Black | Gray | Distinct from peer tutors |
| Already Exists | Gray | Gray | Neutral status |
| New | Blue | Blue | Positive action |
| Transfer | Amber | Amber | Warning/change |
| Not Found | Red | Red | Error/missing |

## Error Handling

The system handles all edge cases:
- ✅ Email-only entries
- ✅ Name-only entries
- ✅ Missing entities
- ✅ Duplicate assignments
- ✅ Student transfers
- ✅ Mixed valid/invalid data
- ✅ Empty fields
- ✅ Case variations
