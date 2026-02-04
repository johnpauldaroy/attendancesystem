import { useState } from 'react';
import { db, auth } from '@/lib/firebase';
import { collection, addDoc, Timestamp, setDoc, doc } from 'firebase/firestore';
import { createUserWithEmailAndPassword, signInWithEmailAndPassword } from 'firebase/auth';
import { Button } from '@/components/ui/button';
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card';
import { toast } from 'sonner';

const SeedPage = () => {
    const [loading, setLoading] = useState(false);

    const seedData = async () => {
        setLoading(true);
        try {
            // 1. Create Admin User (if not logic handled here, just info)
            // Note: createUserWithEmailAndPassword signs in immediately. 
            // We might want to just log this part or try/catch if user exists.
            try {
                const userCredential = await createUserWithEmailAndPassword(auth, 'admin@example.com', 'password123');
                // Create user profile
                await setDoc(doc(db, 'users', userCredential.user.uid), {
                    name: 'System Admin',
                    email: 'admin@example.com',
                    role: 'SUPER_ADMIN',
                    branch_id: '1', // Default to Branch 1
                    branch: { id: '1', name: 'Main Branch' }
                });
                toast.success('Admin user created (admin@example.com / password123)');
            } catch (e: any) {
                // If user exists, try to login and ensure their profile exists too
                if (e.code === 'auth/email-already-in-use') {
                    try {
                        const userCredential = await signInWithEmailAndPassword(auth, 'admin@example.com', 'password123');
                        await setDoc(doc(db, 'users', userCredential.user.uid), {
                            name: 'System Admin',
                            email: 'admin@example.com',
                            role: 'SUPER_ADMIN',
                            branch_id: '1',
                            branch: { id: '1', name: 'Main Branch' }
                        }, { merge: true });
                        toast.success('Existing Admin user updated with SUPER_ADMIN role.');
                    } catch (loginErr: any) {
                        console.error('Failed to login as admin to fix profile:', loginErr);
                        toast.error('Could not login as admin: ' + loginErr.message);
                    }
                } else {
                    toast.info('Admin user creation skipped: ' + e.message);
                }
            }

            // 2. Create Members
            const members = [
                {
                    full_name: 'John Doe',
                    member_no: 'HQ01-0001',
                    cif_key: 'CIF-001',
                    origin_branch_id: '1',
                    status: 'ACTIVE',
                    sex: 'MALE',
                    civil_status: 'MARRIED',
                    birth_date: '1980-01-01',
                    address: '123 Main St',
                    city_town: 'Metropolis',
                    classification: 'REGULAR',
                    annual_income: '50000',
                    contact_no: '09171234567'
                },
                {
                    full_name: 'Jane Smith',
                    member_no: 'HQ01-0002',
                    cif_key: 'CIF-002',
                    origin_branch_id: '1',
                    status: 'ACTIVE',
                    sex: 'FEMALE',
                    civil_status: 'SINGLE',
                    birth_date: '1990-05-15',
                    address: '456 Oak Avenue',
                    city_town: 'Smallville',
                    classification: 'ASSOCIATE',
                    annual_income: '40000',
                    contact_no: '09181234567'
                },
                {
                    full_name: 'Bob Johnson',
                    member_no: 'BR02-0001',
                    cif_key: 'CIF-003',
                    origin_branch_id: '2',
                    status: 'INACTIVE',
                    sex: 'MALE',
                    civil_status: 'SINGLE',
                    classification: 'REGULAR',
                    contact_no: '09191234567'
                },
            ];

            for (const m of members) {
                await addDoc(collection(db, 'members'), {
                    ...m,
                    created_at: Timestamp.now()
                });
            }
            toast.success('Members seeded');

            // 3. Create Attendance (deterministic doc id per member per day)
            const seedNow = new Date();
            const attendanceDate = new Date(seedNow.getTime() - seedNow.getTimezoneOffset() * 60000)
                .toISOString()
                .split('T')[0];

            await setDoc(doc(db, 'attendance', `mock-id_${attendanceDate}`), {
                attendance_date: attendanceDate,
                attendance_date_time: Timestamp.fromDate(seedNow),
                member_id: 'mock-id',
                member: { full_name: 'John Doe', member_no: 'HQ01-0001', origin_branch_id: '1' },
                origin_branch: { name: 'Branch 1', id: '1' },
                origin_branch_id: '1',
                visited_branch: { name: 'Branch 1', id: '1' },
                visited_branch_id: '1',
                status: 'APPROVED',
                created_by_name: 'System Admin'
            });

            await setDoc(doc(db, 'attendance', `mock-id-2_${attendanceDate}`), {
                attendance_date: attendanceDate,
                attendance_date_time: Timestamp.fromDate(seedNow),
                member_id: 'mock-id-2',
                member: { full_name: 'Jane Smith', member_no: 'HQ01-0002', origin_branch_id: '1' },
                origin_branch: { name: 'Branch 1', id: '1' },
                origin_branch_id: '1',
                visited_branch: { name: 'Branch 2', id: '2' },
                visited_branch_id: '2',
                status: 'PENDING',
                created_by_name: 'System Admin'
            });

            toast.success('Attendance seeded');

        } catch (error: any) {
            console.error(error);
            toast.error('Seeding failed: ' + error.message);
        } finally {
            setLoading(false);
        }
    };

    return (
        <div className="min-h-screen flex items-center justify-center bg-muted/30">
            <Card className="w-full max-w-md">
                <CardHeader>
                    <CardTitle>Database Seeding</CardTitle>
                </CardHeader>
                <CardContent className="space-y-4">
                    <p className="text-sm text-muted-foreground">
                        This tool will inject sample data into your Firestore database.
                        <br />
                        <strong>Admin User:</strong> admin@example.com / password123
                    </p>
                    <Button onClick={seedData} disabled={loading} className="w-full">
                        {loading ? 'Seeding...' : 'Seed Data'}
                    </Button>
                </CardContent>
            </Card>
        </div>
    );
};

export default SeedPage;
