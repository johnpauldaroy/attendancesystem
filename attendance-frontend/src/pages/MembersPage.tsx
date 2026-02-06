import { useAuth } from '@/hooks/useAuth';
import { useState, useRef, useEffect, useMemo } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { db } from '@/lib/firebase';
import { collection, getDocs, addDoc, updateDoc, deleteDoc, doc, Timestamp, query, where } from 'firebase/firestore';
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card';
import { Table, TableHeader, TableRow, TableHead, TableBody, TableCell } from '@/components/ui/table';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Plus, Pencil, Trash2, X, Save, Search, ArrowLeft, Upload, Download, Loader2 } from 'lucide-react';
import { Link, useSearchParams } from 'react-router-dom';
import { toast } from 'sonner';
import Papa from 'papaparse';

const MembersPage = () => {
    const { user } = useAuth();
    const queryClient = useQueryClient();
    const fileInputRef = useRef<HTMLInputElement>(null);
    const [search, setSearch] = useState('');
    const [isModalOpen, setIsModalOpen] = useState(false);
    const [editingMember, setEditingMember] = useState<any>(null);
    const [isImporting, setIsImporting] = useState(false);
    const [searchParams, setSearchParams] = useSearchParams();
    const [activeTab, setActiveTab] = useState<'members' | 'updates'>('members'); // New Tab State
    const [selectedIds, setSelectedIds] = useState<string[]>([]);
    const [currentPage, setCurrentPage] = useState(1);
    const [selectedBranch, setSelectedBranch] = useState<string>("all");
    const itemsPerPage = 10;

    const initialFormState = {
        // IDs & Status
        cif_key: '',
        status: 'ACTIVE',
        origin_branch_id: '', // Will be overridden if not super admin

        // Personal Info
        full_name: '',
        birth_date: '',
        age: '',
        sex: 'MALE',
        civil_status: 'SINGLE',
        spouse_name: '',

        // Contact & Address
        address: '', // Full address? Or use components below? Keeping components as requested
        unit_house_no: '',
        barangay_village: '',
        city_town: '',
        province: '',
        telephone_no: '',
        contact_no: '',

        // Membership Details
        date_of_membership: '',
        classification: '',
        membership_type: '',
        position: '',
        segmentation: '',
        attendance_status: '',
        representatives_status: '',

        // Financial & Gov
        annual_income: '',
        tin_no: '',
        sss_no: '',
        gsis_no: '',
        educational_attainment: '',

        // New fields from Excel
        membership_status: '',
        membership_update: '',
        attend_ra: '',
    };

    const [formData, setFormData] = useState(initialFormState);
    const [touched, setTouched] = useState<Record<string, boolean>>({});

    const markTouched = (key: string) => setTouched((t) => ({ ...t, [key]: true }));
    const isEmpty = (val: any) => val === undefined || val === null || String(val).trim() === '';
    const invalidClass = (field: string, val: any) =>
        touched[field] && isEmpty(val) ? 'border-red-500 focus-visible:ring-red-500' : '';

    const [importProgress, setImportProgress] = useState({
        running: false,
        processed: 0,
        total: 0,
        success: 0,
        skipped: 0
    });

    // Effect to set default branch for non-super admins
    useEffect(() => {
        if (isModalOpen && !editingMember && user?.role !== 'SUPER_ADMIN' && user?.branch_id) {
            setFormData(prev => ({ ...prev, origin_branch_id: String(user.branch_id) }));
        }
    }, [isModalOpen, user, editingMember]);

    const { data: members, isLoading } = useQuery({
        queryKey: ['members', user?.branch_id, user?.role],
        queryFn: async () => {
            if (!user) return [];

            let q;
            if (user.role === 'SUPER_ADMIN') {
                q = collection(db, 'members');
            } else {
                // Query strictly by the user's branch_id type as allowed by Firestore rules
                q = query(collection(db, 'members'), where('origin_branch_id', '==', user.branch_id));
            }

            const snapshot = await getDocs(q);
            return snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as any));
        },
        enabled: !!user
    });

    const availableBranches = useMemo(() => {
        if (!members) return [];
        const branches = Array.from(new Set(members.map((m: any) => String(m.origin_branch_id)).filter(Boolean)));
        return branches.sort((a, b) => Number(a) - Number(b));
    }, [members]);

    const filteredMembers = useMemo(() => {
        if (!members) return [];
        return members.filter((m: any) => {
            const matchesSearch = m.full_name?.toLowerCase().includes(search.toLowerCase()) ||
                m.cif_key?.toLowerCase().includes(search.toLowerCase());
            const matchesBranch = selectedBranch === "all" || String(m.origin_branch_id) === selectedBranch;
            return matchesSearch && matchesBranch;
        });
    }, [members, search, selectedBranch]);

    // Pagination Logic
    const totalItems = filteredMembers.length;
    const totalPages = Math.ceil(totalItems / itemsPerPage);
    const paginatedMembers = useMemo(() => {
        const start = (currentPage - 1) * itemsPerPage;
        return filteredMembers.slice(start, start + itemsPerPage);
    }, [filteredMembers, currentPage, itemsPerPage]);

    // Reset to page 1 on search or branch change
    useEffect(() => {
        setCurrentPage(1);
    }, [search, selectedBranch]);

    const allVisibleIds = useMemo(() => paginatedMembers.map((m: any) => m.id), [paginatedMembers]);

    const canDelete = user?.role === 'SUPER_ADMIN';
    const canImport = user?.role === 'SUPER_ADMIN';
    const canExport = true;
    const canEdit = ['SUPER_ADMIN', 'BRANCH_ADMIN', 'STAFF', 'APPROVER'].includes(user?.role || '');

    const saveMutation = useMutation({
        mutationFn: async (data: any) => {
            // Normalize required identifiers
            const normalizedData = {
                ...data,
                member_no: data.cif_key || data.member_no || '',
                cif_key: data.cif_key || data.member_no || ''
            };

            // Normalize branch id for rules comparison
            const rawBranch = user?.role === 'SUPER_ADMIN'
                ? (normalizedData.origin_branch_id ?? normalizedData.origin_branch?.id ?? user?.branch_id ?? user?.branch?.id)
                : (user?.branch_id ?? user?.branch?.id);
            const finalBranchId = rawBranch != null ? String(rawBranch) : '';

            // Duplicate CIF key check (exact match)
            const dupSnap = await getDocs(
                query(
                    collection(db, 'members'),
                    where('cif_key', '==', normalizedData.cif_key)
                )
            );
            const hasDup = dupSnap.docs.some((d) => d.id !== (editingMember?.id || ''));
            if (hasDup) {
                throw new Error('Duplicate CIF Key found. Please use a unique CIF Key.');
            }

            if (editingMember) {
                // UPDATE
                const memberRef = doc(db, 'members', editingMember.id);
                const updatedData = {
                    ...normalizedData,
                    origin_branch_id: finalBranchId,
                    origin_branch: { name: 'Branch ' + finalBranchId, id: finalBranchId },
                    updated_at: Timestamp.now() // Add updated_at for updates
                };
                await updateDoc(memberRef, updatedData);

                // Calculate Diff for Audit Log
                const changes: string[] = [];
                const ignoredFields = ['origin_branch', 'created_at', 'updated_at', 'id'];

                Object.keys(updatedData).forEach(key => {
                    if (ignoredFields.includes(key)) return;
                    const oldVal = editingMember[key];
                    const newVal = updatedData[key];
                    // Simple comparison, treating null/undefined/empty string as equivalent for comparison
                    if (String(oldVal || '').trim() !== String(newVal || '').trim()) {
                        changes.push(`${key}: "${oldVal || ''}" -> "${newVal || ''}"`);
                    }
                });

                if (changes.length > 0) {
                    await addDoc(collection(db, 'audit_logs'), {
                        action_type: 'MEMBER_UPDATE',
                        entity_type: 'MEMBER',
                        entity_id: editingMember.member_no || editingMember.id,
                        actor_user_id: user?.uid,
                        actor_name: user?.name || user?.email,
                        branch_id: user?.branch_id, // Log with user's branch
                        created_at: Timestamp.now(),
                        details: changes.join(', '), // Readable string
                        changes_array: changes // Structured for potential future use
                    });
                }

            } else {
                // CREATE
                const payload = {
                    ...normalizedData,
                    origin_branch_id: finalBranchId,
                    origin_branch: { name: 'Branch ' + finalBranchId, id: finalBranchId },
                    created_at: Timestamp.now()
                };
                const docRef = await addDoc(collection(db, 'members'), payload);

                // Log Creation
                await addDoc(collection(db, 'audit_logs'), {
                    action_type: 'MEMBER_CREATE',
                    entity_type: 'MEMBER',
                    entity_id: data.member_no || docRef.id,
                    actor_user_id: user?.uid,
                    actor_name: user?.name || user?.email,
                    branch_id: user?.branch_id,
                    created_at: Timestamp.now(),
                    details: 'Member created'
                });
            }
        },
        onSuccess: () => {
            toast.success(editingMember ? 'Member updated' : 'Member created');
            setIsModalOpen(false);
            setEditingMember(null);
            setFormData(initialFormState);
            queryClient.invalidateQueries({ queryKey: ['members'] });
        },
        onError: (err: any) => {
            const msg = err?.message || 'Failed to save member';
            toast.error(msg);
        }
    });

    const deleteMutation = useMutation({
        mutationFn: async (id: string) => {
            if (!canDelete) throw new Error('Only Super Admin can delete members');
            await deleteDoc(doc(db, 'members', id));

            // Log Deletion
            await addDoc(collection(db, 'audit_logs'), {
                action_type: 'MEMBER_DELETE',
                entity_type: 'MEMBER',
                entity_id: id, // Use the ID of the deleted member
                actor_user_id: user?.uid,
                actor_name: user?.name || user?.email,
                branch_id: user?.branch_id,
                created_at: Timestamp.now(),
                details: `Member with ID ${id} deleted`
            });
        },
        onSuccess: () => {
            toast.success('Member deleted');
            queryClient.invalidateQueries({ queryKey: ['members'] });
        },
        onError: (err: any) => {
            toast.error(err?.message || 'Delete not allowed');
        }
    });

    const batchDeleteMutation = useMutation({
        mutationFn: async (ids: string[]) => {
            if (!canDelete) throw new Error('Only Super Admin can delete members');
            if (!ids.length) return;
            await Promise.all(ids.map(async (id) => {
                await deleteDoc(doc(db, 'members', id));
                await addDoc(collection(db, 'audit_logs'), {
                    action_type: 'MEMBER_DELETE',
                    entity_type: 'MEMBER',
                    entity_id: id,
                    actor_user_id: user?.uid,
                    actor_name: user?.name || user?.email,
                    branch_id: user?.branch_id,
                    created_at: Timestamp.now(),
                    details: `Member with ID ${id} deleted (batch)`
                });
            }));
        },
        onSuccess: () => {
            toast.success('Selected members deleted');
            setSelectedIds([]);
            queryClient.invalidateQueries({ queryKey: ['members'] });
        },
        onError: (err: any) => toast.error(err?.message || 'Batch delete failed')
    });

    // --- Location API State ---
    const [provinces, setProvinces] = useState<any[]>([]);
    const [cities, setCities] = useState<any[]>([]);
    const [barangays, setBarangays] = useState<any[]>([]);

    const [selectedProvinceCode, setSelectedProvinceCode] = useState('');
    const [selectedCityCode, setSelectedCityCode] = useState('');
    const [selectedBarangayCode, setSelectedBarangayCode] = useState('');

    // Fetch Provinces on Mount
    useEffect(() => {
        fetch('https://psgc.gitlab.io/api/provinces/')
            .then(res => res.json())
            .then(data => setProvinces(data.sort((a: any, b: any) => a.name.localeCompare(b.name))))
            .catch(err => console.error('Failed to load provinces:', err));
    }, []);

    const handleProvinceChange = (code: string, name: string) => {
        setSelectedProvinceCode(code);
        setFormData(prev => ({ ...prev, province: name, city_town: '', barangay_village: '' })); // Reset child fields
        setCities([]);
        setBarangays([]);
        setSelectedCityCode('');
        setSelectedBarangayCode('');

        if (code) {
            fetch(`https://psgc.gitlab.io/api/provinces/${code}/cities-municipalities/`)
                .then(res => res.json())
                .then(data => setCities(data.sort((a: any, b: any) => a.name.localeCompare(b.name))))
                .catch(err => console.error('Failed to load cities:', err));
        }
    };

    const handleCityChange = (code: string, name: string) => {
        setSelectedCityCode(code);
        setFormData(prev => ({ ...prev, city_town: name, barangay_village: '' })); // Reset child field
        setBarangays([]);
        setSelectedBarangayCode('');

        if (code) {
            fetch(`https://psgc.gitlab.io/api/cities-municipalities/${code}/barangays/`)
                .then(res => res.json())
                .then(data => setBarangays(data.sort((a: any, b: any) => a.name.localeCompare(b.name))))
                .catch(err => console.error('Failed to load barangays:', err));
        }
    };

    const handleBarangayChange = (code: string, name: string) => {
        setSelectedBarangayCode(code);
        setFormData(prev => ({ ...prev, barangay_village: name }));
    };

    // --- CSV Helper Functions ---

    const handleDownloadTemplate = () => {
        if (!canImport) {
            toast.error('Only Super Admin can download the template');
            return;
        }
        // Define specific order for the CSV template
        const headers = [
            'CIFKey',
            'Member Name',
            'Birth Date',
            'Age',
            'Address',
            'Telephone #',
            'Contact #',
            'Sex',
            'Civil Status',
            'Date Of Membership',
            'Classification',
            'Membership Type',
            'Status',
            'Position',
            'AnnualIncome',
            'TIN',
            'SSS',
            'SpouseName',
            'EducAttainment',
            'Unit/House Number/Street',
            'Barangay Village',
            'City/Town/Municipality',
            'Province',
            'GSIS',
            'Membership Status',
            'Segmentation Status',
            'Representative Status',
            'Membership Update',
            'Attendance Status',
            'Attend RA',
            'Origin Branch ID'
        ];

        const csv = Papa.unparse({
            fields: headers,
            data: [] // Empty data, just headers
        });

        const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
        const link = document.createElement('a');
        const url = URL.createObjectURL(blob);
        link.setAttribute('href', url);
        link.setAttribute('download', 'members_import_template.csv');
        link.style.visibility = 'hidden';
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
    };

    const handleImportClick = () => {
        if (!canImport) {
            toast.error('Only Super Admin can import records');
            return;
        }
        fileInputRef.current?.click();
    };

    const toggleSelectOne = (id: string) => {
        setSelectedIds(prev =>
            prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id]
        );
    };

    const toggleSelectAllVisible = () => {
        if (selectedIds.length === allVisibleIds.length) {
            setSelectedIds([]);
        } else {
            setSelectedIds(allVisibleIds);
        }
    };

    const handleFileUpload = (event: React.ChangeEvent<HTMLInputElement>) => {
        if (!canImport) {
            toast.error('Only Super Admin can import records');
            return;
        }
        const file = event.target.files?.[0];
        if (!file) return;

        const nameLower = file.name.toLowerCase();
        if (!nameLower.endsWith('.csv')) {
            toast.error('Only CSV files are supported. Please save your Excel file as CSV (UTF-8) and try again.');
            if (fileInputRef.current) fileInputRef.current.value = '';
            return;
        }

        setIsImporting(true);
        setImportProgress({ running: true, processed: 0, total: 0, success: 0, skipped: 0 });
        Papa.parse(file, {
            header: true,
            skipEmptyLines: true,
            complete: async (results) => {
                const rows = results.data as any[];
                setImportProgress({ running: true, processed: 0, total: rows.length, success: 0, skipped: 0 });
                let successCount = 0;
                let errorCount = 0;
                const userBranchId = user?.role === 'SUPER_ADMIN' ? null : String(user?.branch_id);
                const skipped: Record<string, number> = {};
                let firstErrorMsg = '';
                let firstErrorRow: any = null;
                let processed = 0;
                const addSkip = (reason: string, row?: any, err?: any) => {
                    skipped[reason] = (skipped[reason] || 0) + 1;
                    if (!firstErrorMsg) {
                        firstErrorMsg = typeof err === 'string' ? err : err?.message || reason;
                        firstErrorRow = row;
                    }
                };
                const bumpProgress = () => {
                    setImportProgress({
                        running: true,
                        processed,
                        total: rows.length,
                        success: successCount,
                        skipped: errorCount
                    });
                };

                for (const rawRow of rows) {
                    let diagInfo = '';
                    try {
                        // Normalize keys: trim, lowercase, remove non-alphanumeric for flexible header matching
                        const normKey = (k: string) => k.trim().toLowerCase().replace(/[^a-z0-9]/g, '');
                        const normRow: Record<string, any> = {};
                        Object.keys(rawRow).forEach(key => {
                            normRow[normKey(key)] = rawRow[key];
                        });
                        const pick = (...aliases: string[]) => {
                            for (const alias of aliases) {
                                const v = normRow[normKey(alias)];
                                if (v !== undefined && v !== null && String(v).trim() !== '') return String(v).trim();
                            }
                            return '';
                        };

                        const branchId = userBranchId || pick('origin_branch_id', 'branch_id', 'branch') || '1'; // Default to 1 if missing
                        const statusVal = (pick('status') || 'ACTIVE').toUpperCase();
                        diagInfo = ` (Branch: ${branchId}, Status: ${statusVal})`;

                        // Specific mapping for Sex
                        let sexVal = pick('sex', 'gender').toUpperCase();
                        if (sexVal === 'M' || sexVal === 'MALE') sexVal = 'MALE';
                        else if (sexVal === 'F' || sexVal === 'FEMALE') sexVal = 'FEMALE';
                        else sexVal = 'MALE'; // Default if unknown

                        // Map Excel Headers to Internal Keys
                        const mappedData = {
                            cif_key: pick('cifkey', 'cif_key', 'member_no', 'memberno', 'cif'), // require
                            full_name: pick('membername', 'full_name', 'fullname', 'name'), // require
                            birth_date: pick('birthdate', 'birth_date', 'dob'),
                            age: pick('age'),
                            address: pick('address'),
                            telephone_no: pick('telephone', 'telephone#', 'telephone_no', 'tel'),
                            contact_no: pick('contact', 'contact#', 'contact_no', 'mobile', 'mobile_no', 'phone'),
                            sex: sexVal,
                            civil_status: (pick('civilstatus', 'civil_status') || 'SINGLE').toUpperCase(),
                            date_of_membership: pick('dateofmembership', 'date_of_membership'),
                            classification: pick('classification'),
                            membership_type: pick('membershiptype', 'membership_type'),
                            status: statusVal,
                            position: pick('position'),
                            annual_income: pick('annualincome', 'annual_income'),
                            tin_no: pick('tin', 'tin_no'),
                            sss_no: pick('sss', 'sss_no'),
                            spouse_name: pick('spousename', 'spouse_name'),
                            educational_attainment: pick('educattainment', 'educational_attainment'),
                            unit_house_no: pick('unit/house number/street', 'unithousenumberstreet', 'unit_house_no'),
                            barangay_village: pick('barangay', 'barangayvillage', 'barangay_village'),
                            city_town: pick('city', 'citytown', 'city_town', 'city/town/municipality'),
                            province: pick('province'),
                            gsis_no: pick('gsis', 'gsis_no'),
                            membership_status: pick('membershipstatus', 'membership_status'),
                            segmentation: pick('segmentationstatus', 'segmentation'),
                            representatives_status: pick('representativestatus', 'representatives_status'),
                            membership_update: pick('membershipupdate', 'membership_update'),
                            attendance_status: pick('attendancestatus', 'attendance_status'),
                            attend_ra: pick('attendra', 'attend_ra'),
                            origin_branch_id: branchId
                        };

                        // Basic validation
                        if (!mappedData.full_name) {
                            addSkip('row missing Name', normRow);
                            errorCount++;
                            continue;
                        }
                        if (!mappedData.cif_key) {
                            addSkip('row missing CIF Key', normRow);
                            errorCount++;
                            continue;
                        }

                        // Merge with initial state
                        const payload = {
                            ...initialFormState,
                            ...mappedData,
                            member_no: mappedData.cif_key, // keep legacy field equal to CIF for compatibility
                            origin_branch: { name: 'Branch ' + branchId, id: branchId },
                            created_at: Timestamp.now()
                        };

                        await addDoc(collection(db, 'members'), payload);

                        // Log Creation
                        await addDoc(collection(db, 'audit_logs'), {
                            action_type: 'MEMBER_CREATE',
                            entity_type: 'MEMBER',
                            entity_id: mappedData.cif_key || 'UNKNOWN', // Use CIF as ID reference for log if available
                            actor_user_id: user?.uid || 'system',
                            actor_name: user?.name || user?.email || 'System Import',
                            branch_id: branchId, // Crucial for filtering
                            created_at: Timestamp.now(),
                            changes: { type: 'bulk_import' }
                        });

                        successCount++;
                        processed++;
                        if (processed % 200 === 0) bumpProgress();
                    } catch (e: any) {
                        console.error('Import error for row:', rawRow, e);
                        const msg = e?.message || String(e);
                        addSkip(`error: ${msg}${diagInfo}`, rawRow, e);
                        errorCount++;
                        processed++;
                        if (processed % 200 === 0) bumpProgress();
                    }
                }

                const reasonSummary = Object.entries(skipped).map(([k, v]) => `${v} ${k}`).join('; ');
                const detail = firstErrorMsg ? ` Detail: ${firstErrorMsg}${firstErrorRow ? ' (sample data available in console)' : ''}` : '';

                if (errorCount > 0 && successCount === 0) {
                    toast.error(`Import Failed: All ${errorCount} rows skipped. ${reasonSummary}. ${detail}`);
                } else if (errorCount > 0) {
                    toast.warning(`Import partial: ${successCount} added, ${errorCount} skipped. ${reasonSummary}`);
                } else {
                    toast.success(`Import complete: ${successCount} added.`);
                }
                setIsImporting(false);
                setImportProgress({ running: false, processed: rows.length, total: rows.length, success: successCount, skipped: errorCount });
                if (fileInputRef.current) fileInputRef.current.value = '';
                queryClient.invalidateQueries({ queryKey: ['members'] });
            },
            error: (error) => {
                toast.error('CSV Parse Error: ' + error.message);
                setIsImporting(false);
                setImportProgress({ running: false, processed: 0, total: 0, success: 0, skipped: 0 });
                if (fileInputRef.current) fileInputRef.current.value = '';
            }
        });
    };


    const handleEdit = (member: any) => {
        setEditingMember(member);
        setFormData({ ...initialFormState, ...member, member_no: undefined });
        setIsModalOpen(true);

        // Attempt to pre-select dropdowns if names match (Best Effort)
        // This is tricky without codes stored, so for now we reset them to blank
        // or the user has to re-select if they want to change it.
        // A full implementation would try to find the code in 'provinces' array matching 'member.province', etc.
        setSelectedProvinceCode('');
        setSelectedCityCode('');
        setSelectedBarangayCode('');
        setCities([]);
        setBarangays([]);
    };

    const handleAddNew = () => {
        setEditingMember(null);
        setFormData(initialFormState);
        setIsModalOpen(true);
        setSelectedProvinceCode('');
        setSelectedCityCode('');
        setSelectedBarangayCode('');
        setCities([]);
        setBarangays([]);
    };

    const handleSubmit = (e: React.FormEvent) => {
        e.preventDefault();
        saveMutation.mutate(formData);
    };

    const handleChange = (field: string, value: string) => {
        markTouched(field);
        setFormData(prev => ({ ...prev, [field]: value }));
    };

    // Open edit modal when ?edit=<id> is present
    useEffect(() => {
        const editId = searchParams.get('edit');
        if (!editId || !members || members.length === 0) return;

        const match = members.find((m: any) => m.id === editId);
        if (match) {
            handleEdit(match);
            // remove the param so it doesn't reopen repeatedly
            searchParams.delete('edit');
            setSearchParams(searchParams, { replace: true });
        }
    }, [searchParams, members]);

    const handleExport = (data: any[] | null | undefined = members) => {
        const source = data && data.length ? data : members || [];

        if (!canExport || source.length === 0) {
            toast.error('No records to export');
            return;
        }

        const rows = source.map((m: any) => ({
            'CIFKey': m.cif_key || '',
            'Member Name': m.full_name || '',
            'Birth Date': m.birth_date || '',
            'Age': m.age || '',
            'Address': m.address || '',
            'Telephone #': m.telephone_no || '',
            'Contact #': m.contact_no || '',
            'Sex': m.sex || '',
            'Civil Status': m.civil_status || '',
            'Date Of Membership': m.date_of_membership || '',
            'Classification': m.classification || '',
            'Membership Type': m.membership_type || '',
            'Status': m.status || '',
            'Position': m.position || '',
            'AnnualIncome': m.annual_income || '',
            'TIN': m.tin_no || '',
            'SSS': m.sss_no || '',
            'SpouseName': m.spouse_name || '',
            'EducAttainment': m.educational_attainment || '',
            'Unit/House Number/Street': m.unit_house_no || '',
            'Barangay Village': m.barangay_village || '',
            'City/Town/Municipality': m.city_town || '',
            'Province': m.province || '',
            'GSIS': m.gsis_no || '',
            'Membership Status': m.membership_status || '',
            'Segmentation Status': m.segmentation || '',
            'Representative Status': m.representatives_status || '',
            'Membership Update': m.membership_update || '',
            'Attendance Status': m.attendance_status || '',
            'Attend RA': m.attend_ra || '',
            'Origin Branch ID': m.origin_branch_id || ''
        }));
        const csv = Papa.unparse(rows);
        const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
        const url = URL.createObjectURL(blob);
        const link = document.createElement('a');
        link.href = url;
        link.download = 'members_export.csv';
        link.click();
        URL.revokeObjectURL(url);
    };

    return (
        <div className="min-h-screen bg-muted/30 p-3 md:p-4 space-y-4">
            <div className="container mx-auto max-w-7xl space-y-4">
                <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
                    <div className="flex items-center gap-3">
                        <Link to="/">
                            <Button variant="ghost" size="icon" className="h-9 w-9">
                                <ArrowLeft className="h-4 w-4" />
                            </Button>
                        </Link>
                        <div>
                            <h1 className="text-2xl font-bold">Members Management</h1>
                            <p className="text-sm text-muted-foreground">Manage branch members and profiles</p>
                        </div>
                    </div>

                    {/* Tabs */}
                    <div className="flex bg-muted p-1 rounded-lg">
                        <button
                            onClick={() => setActiveTab('members')}
                            className={`px-4 py-2 text-sm font-medium rounded-md transition-all ${activeTab === 'members' ? 'bg-white shadow text-foreground' : 'text-muted-foreground hover:text-foreground'}`}
                        >
                            Members List
                        </button>
                        <button
                            onClick={() => setActiveTab('updates')}
                            className={`px-4 py-2 text-sm font-medium rounded-md transition-all ${activeTab === 'updates' ? 'bg-white shadow text-foreground' : 'text-muted-foreground hover:text-foreground'}`}
                        >
                            Profile Updates
                        </button>
                    </div>

                    <div className="flex flex-wrap gap-2 w-full md:w-auto justify-start md:justify-end">
                        <input
                            type="file"
                            accept=".csv"
                            ref={fileInputRef}
                            style={{ display: 'none' }}
                            onChange={handleFileUpload}
                        />
                        {activeTab === 'members' && (
                            <>
                                <Button variant="outline" size="sm" onClick={handleDownloadTemplate} disabled={isImporting || !canImport}>
                                    <Download className="h-4 w-4 mr-2" /> Template
                                </Button>
                                <Button variant="outline" size="sm" onClick={handleImportClick} disabled={isImporting || !canImport}>
                                    {isImporting ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <Upload className="h-4 w-4 mr-2" />}
                                    Import CSV
                                </Button>
                                <Button variant="outline" size="sm" onClick={() => handleExport(filteredMembers || [])} disabled={!filteredMembers || filteredMembers.length === 0}>
                                    <Download className="h-4 w-4 mr-2" /> Export CSV
                                </Button>
                                {canDelete && (
                                    <Button
                                        variant="destructive"
                                        size="sm"
                                        onClick={() => {
                                            if (!selectedIds.length) return;
                                            const ok = window.confirm(`Delete ${selectedIds.length} selected member(s)? This cannot be undone.`);
                                            if (ok) batchDeleteMutation.mutate(selectedIds);
                                        }}
                                        disabled={!selectedIds.length || batchDeleteMutation.isPending}
                                    >
                                        {batchDeleteMutation.isPending ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <Trash2 className="h-4 w-4 mr-2" />}
                                        Delete Selected
                                    </Button>
                                )}
                                <Button onClick={handleAddNew}>
                                    <Plus className="h-4 w-4 mr-2" /> Add Member
                                </Button>
                                {importProgress.running && (
                                    <span className="text-xs text-muted-foreground w-full md:w-auto">
                                        Importing {importProgress.processed}/{importProgress.total} (ok {importProgress.success}, skipped {importProgress.skipped})
                                    </span>
                                )}
                            </>
                        )}
                    </div>
                </div>

                {activeTab === 'members' ? (
                    <Card>
                        <CardHeader className="pb-2">
                            <div className="flex flex-col md:flex-row items-center gap-2">
                                <div className="relative flex-1 w-full">
                                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                                    <Input
                                        placeholder="Search by name, member no, or CIF key..."
                                        value={search}
                                        onChange={(e) => setSearch(e.target.value)}
                                        className="pl-9 w-full"
                                    />
                                </div>
                                {user?.role === "SUPER_ADMIN" && (
                                    <select
                                        className="h-10 w-full md:w-[200px] rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                                        value={selectedBranch}
                                        onChange={(e) => setSelectedBranch(e.target.value)}
                                    >
                                        <option value="all">All Branches</option>
                                        {availableBranches.map(b => (
                                            <option key={b} value={b}>Branch {b}</option>
                                        ))}
                                    </select>
                                )}
                            </div>
                        </CardHeader>
                        <CardContent className="p-0">
                            {/* Mobile list */}
                            <div className="md:hidden space-y-3 p-4 pt-0">
                                {isLoading ? (
                                    <div className="text-center text-sm text-muted-foreground py-6">Loading...</div>
                                ) : filteredMembers && filteredMembers.length > 0 ? (
                                    paginatedMembers.map((m: any) => (
                                        <div key={m.id} className="rounded-xl border p-3 shadow-sm bg-white">
                                            <div className="flex items-start justify-between gap-3">
                                                <div>
                                                    <div className="text-xs text-muted-foreground">Member No</div>
                                                    <div className="font-semibold text-sm">{m.member_no}</div>
                                                    <div className="text-xs text-muted-foreground mt-1">CIF: {m.cif_key || '-'}</div>
                                                </div>
                                                <Badge variant={m.status === 'ACTIVE' ? 'success' : 'secondary'} className="text-[11px] px-2">
                                                    {m.status}
                                                </Badge>
                                            </div>
                                            <div className="mt-2">
                                                <div className="font-semibold">{m.full_name}</div>
                                                <div className="text-sm text-muted-foreground">{m.classification || '-'}</div>
                                                <div className="text-sm text-muted-foreground">{m.contact_no || '-'}</div>
                                            </div>
                                            <div className="mt-3 flex justify-end gap-2">
                                                <Button variant="outline" size="sm" onClick={() => handleEdit(m)} disabled={!canEdit}>
                                                    <Pencil className="h-4 w-4" />
                                                </Button>
                                                {canDelete && (
                                                    <Button
                                                        variant="outline"
                                                        size="sm"
                                                        className="text-destructive"
                                                        onClick={() => {
                                                            if (confirm('Delete this member?')) deleteMutation.mutate(m.id);
                                                        }}
                                                    >
                                                        <Trash2 className="h-4 w-4" />
                                                    </Button>
                                                )}
                                            </div>
                                        </div>
                                    ))
                                ) : (
                                    <div className="text-center text-sm text-muted-foreground py-6">No members found</div>
                                )}
                            </div>

                            {/* Desktop table */}
                            <div className="hidden md:block">
                                <Table>
                                    <TableHeader>
                                        <TableRow>
                                            {canDelete && (
                                                <TableHead className="w-10">
                                                    <input
                                                        type="checkbox"
                                                        aria-label="Select all"
                                                        checked={selectedIds.length === allVisibleIds.length && allVisibleIds.length > 0}
                                                        onChange={toggleSelectAllVisible}
                                                    />
                                                </TableHead>
                                            )}
                                            <TableHead>CIF Key</TableHead>
                                            <TableHead>Full Name</TableHead>
                                            <TableHead>Classification</TableHead>
                                            <TableHead>Contact</TableHead>
                                            <TableHead>Origin Branch</TableHead>
                                            <TableHead>Status</TableHead>
                                            <TableHead className="text-right">Actions</TableHead>
                                        </TableRow>
                                    </TableHeader>
                                    <TableBody>
                                        {isLoading ? (
                                            <TableRow><TableCell colSpan={canDelete ? 8 : 7} className="text-center h-24">Loading...</TableCell></TableRow>
                                        ) : filteredMembers && filteredMembers.length > 0 ? (
                                            paginatedMembers.map((m: any) => (
                                                <TableRow key={m.id}>
                                                    {canDelete && (
                                                        <TableCell>
                                                            <input
                                                                type="checkbox"
                                                                checked={selectedIds.includes(m.id)}
                                                                onChange={() => toggleSelectOne(m.id)}
                                                                aria-label="Select member"
                                                            />
                                                        </TableCell>
                                                    )}
                                                    <TableCell className="font-medium">{m.cif_key || '-'}</TableCell>
                                                    <TableCell className="font-medium">{m.full_name}</TableCell>
                                                    <TableCell>{m.classification || '-'}</TableCell>
                                                    <TableCell>{m.contact_no || '-'}</TableCell>
                                                    <TableCell>{m.origin_branch_id || '-'}</TableCell>
                                                    <TableCell>
                                                        <Badge variant={m.status === 'ACTIVE' ? 'success' : 'secondary'} className="text-[10px]">
                                                            {m.status}
                                                        </Badge>
                                                    </TableCell>
                                                    <TableCell className="text-right">
                                                        <div className="flex justify-end gap-2">
                                                            <Button variant="ghost" size="sm" onClick={() => handleEdit(m)} disabled={!canEdit}>
                                                                <Pencil className="h-4 w-4 text-muted-foreground" />
                                                            </Button>
                                                            {canDelete && (
                                                                <Button
                                                                    variant="ghost"
                                                                    size="sm"
                                                                    className="text-destructive hover:text-destructive"
                                                                    onClick={() => {
                                                                        if (confirm('Delete this member?')) deleteMutation.mutate(m.id);
                                                                    }}
                                                                >
                                                                    <Trash2 className="h-4 w-4" />
                                                                </Button>
                                                            )}
                                                        </div>
                                                    </TableCell>
                                                </TableRow>
                                            ))
                                        ) : (
                                            <TableRow><TableCell colSpan={7} className="text-center h-24">No members found</TableCell></TableRow>
                                        )}
                                    </TableBody>
                                </Table>
                            </div>

                            {/* Pagination UI */}
                            {totalItems > 0 && (
                                <div className="flex items-center justify-between px-4 py-3 border-t bg-muted/20 mt-auto">
                                    <div className="text-sm text-muted-foreground">
                                        Showing {Math.min(totalItems, (currentPage - 1) * itemsPerPage + 1)}-{Math.min(totalItems, currentPage * itemsPerPage)} of {totalItems} members
                                    </div>
                                    <div className="flex gap-2 items-center">
                                        <Button
                                            variant="outline"
                                            size="sm"
                                            onClick={() => setCurrentPage(prev => Math.max(1, prev - 1))}
                                            disabled={currentPage === 1}
                                        >
                                            Previous
                                        </Button>
                                        <div className="text-xs font-medium px-2 whitespace-nowrap">
                                            Page {currentPage} of {totalPages || 1}
                                        </div>
                                        <Button
                                            variant="outline"
                                            size="sm"
                                            onClick={() => setCurrentPage(prev => Math.min(totalPages, prev + 1))}
                                            disabled={currentPage === totalPages || totalPages === 0}
                                        >
                                            Next
                                        </Button>
                                    </div>
                                </div>
                            )}
                        </CardContent>
                    </Card>
                ) : (
                    <MemberUpdatesView user={user} />
                )}

                {/* Extended Modal */}
                {isModalOpen && (
                    <div className="fixed inset-0 bg-black/50 flex items-center justify-center p-4 z-50 overflow-y-auto">
                        <Card className="w-full max-w-4xl shadow-2xl my-8 max-h-[90vh] flex flex-col">
                            <CardHeader className="flex flex-row items-center justify-between border-b bg-muted/40 py-3 shrink-0">
                                <CardTitle>{editingMember ? 'Edit Member' : 'Add New Member'}</CardTitle>
                                <Button variant="ghost" size="icon" onClick={() => setIsModalOpen(false)}>
                                    <X className="h-4 w-4" />
                                </Button>
                            </CardHeader>

                            <form onSubmit={handleSubmit} className="flex-1 overflow-y-auto min-h-0">
                                <CardContent className="p-6 space-y-6">
                                    {/* Section 1: Identification & Status */}
                                    <div className="space-y-4">
                                        <h3 className="text-lg font-semibold border-b pb-2">Identification & Status</h3>
                                        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                                            <div className="md:col-span-2">
                                                <label className="text-sm font-medium">CIF Key *</label>
                                                <Input
                                                    required
                                                    className={invalidClass('cif_key', formData.cif_key)}
                                                    value={formData.cif_key}
                                                    onChange={(e) => handleChange('cif_key', e.target.value)}
                                                />
                                            </div>
                                            <div>
                                                <label className="text-sm font-medium">Status</label>
                                                <select className="flex h-9 w-full rounded-md border border-input bg-background px-3"
                                                    value={formData.status} onChange={(e) => handleChange('status', e.target.value)}>
                                                    <option value="ACTIVE">ACTIVE</option>
                                                    <option value="INACTIVE">INACTIVE</option>
                                                </select>
                                            </div>
                                            <div className="md:col-span-1">
                                                <label className="text-sm font-medium">Origin Branch ID *</label>
                                                <Input
                                                    required
                                                    className={invalidClass('origin_branch_id', formData.origin_branch_id)}
                                                    value={formData.origin_branch_id}
                                                    onChange={(e) => handleChange('origin_branch_id', e.target.value)}
                                                    placeholder="e.g. 1"
                                                />
                                            </div>
                                        </div>
                                    </div>

                                    {/* Section 2: Personal Information */}
                                    <div className="space-y-4">
                                        <h3 className="text-lg font-semibold border-b pb-2">Personal Information</h3>
                                        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                                            <div className="md:col-span-1">
                                                <label className="text-sm font-medium">Full Name *</label>
                                                <Input
                                                    required
                                                    className={invalidClass('full_name', formData.full_name)}
                                                    value={formData.full_name}
                                                    onChange={(e) => handleChange('full_name', e.target.value)}
                                                />
                                            </div>
                                            <div>
                                                <label className="text-sm font-medium">Birth Date</label>
                                                <Input
                                                    type="date"
                                                    className={invalidClass('birth_date', formData.birth_date)}
                                                    value={formData.birth_date}
                                                    onChange={(e) => handleChange('birth_date', e.target.value)}
                                                />
                                            </div>
                                            <div>
                                                <label className="text-sm font-medium">Age</label>
                                                <Input
                                                    type="number"
                                                    className={invalidClass('age', formData.age)}
                                                    value={formData.age}
                                                    onChange={(e) => handleChange('age', e.target.value)}
                                                />
                                            </div>
                                            <div>
                                                <label className="text-sm font-medium">Sex</label>
                                                <select className={`flex h-9 w-full rounded-md border border-input bg-background px-3 ${invalidClass('sex', formData.sex)}`}
                                                    value={formData.sex} onChange={(e) => handleChange('sex', e.target.value)}>
                                                    <option value="MALE">MALE</option>
                                                    <option value="FEMALE">FEMALE</option>
                                                </select>
                                            </div>
                                            <div>
                                                <label className="text-sm font-medium">Civil Status</label>
                                                <select className={`flex h-9 w-full rounded-md border border-input bg-background px-3 ${invalidClass('civil_status', formData.civil_status)}`}
                                                    value={formData.civil_status} onChange={(e) => handleChange('civil_status', e.target.value)}>
                                                    <option value="">Select status</option>
                                                    <option value="SINGLE">Single</option>
                                                    <option value="MARRIED">Married</option>
                                                    <option value="WIDOWED">Widowed</option>
                                                    <option value="SEPARATED">Separated</option>
                                                </select>
                                            </div>
                                            <div>
                                                <label className="text-sm font-medium">Spouse Name</label>
                                                <Input value={formData.spouse_name} onChange={(e) => handleChange('spouse_name', e.target.value)} />
                                            </div>
                                            <div>
                                                <label className="text-sm font-medium">Educational Attainment</label>
                                                <select
                                                    className={`flex h-9 w-full rounded-md border border-input bg-background px-3 ${invalidClass('educational_attainment', formData.educational_attainment)}`}
                                                    value={formData.educational_attainment}
                                                    onChange={(e) => handleChange('educational_attainment', e.target.value)}
                                                >
                                                    <option value="">Select education</option>
                                                    <option value="NO FORMAL EDUCATION">No Formal Education</option>
                                                    <option value="ELEMENTARY LEVEL (UNDERGRAD)">Elementary Level (Undergraduate)</option>
                                                    <option value="ELEMENTARY GRADUATE">Elementary Graduate</option>
                                                    <option value="HIGH SCHOOL LEVEL (UNDERGRAD)">High School Level (Undergraduate)</option>
                                                    <option value="HIGH SCHOOL GRADUATE">High School Graduate</option>
                                                    <option value="SENIOR HIGH SCHOOL LEVEL (UNDERGRAD)">Senior High School Level (Undergraduate)</option>
                                                    <option value="SENIOR HIGH SCHOOL GRADUATE">Senior High School Graduate</option>
                                                    <option value="VOCATIONAL LEVEL (UNDERGRAD)">Vocational Course Level (Undergraduate)</option>
                                                    <option value="VOCATIONAL GRADUATE">Vocational Graduate</option>
                                                    <option value="COLLEGE LEVEL (UNDERGRAD)">College Level (Undergraduate)</option>
                                                    <option value="COLLEGE GRADUATE">College Graduate (Bachelor’s Degree)</option>
                                                    <option value="POSTGRADUATE LEVEL (UNDERGRAD)">Postgraduate Level (Undergraduate)</option>
                                                    <option value="MASTER'S DEGREE GRADUATE">Master’s Degree Graduate</option>
                                                    <option value="DOCTORATE">Doctorate</option>
                                                </select>
                                            </div>
                                        </div>
                                    </div>

                                    {/* Section 3: Contact & Address */}
                                    <div className="space-y-4">
                                        <h3 className="text-lg font-semibold border-b pb-2">Address & Contact</h3>
                                        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                                            {/* Province Dropdown */}
                                            <div>
                                                <label className="text-sm font-medium">Province</label>
                                                <select
                                                    className={`flex h-9 w-full rounded-md border border-input bg-background px-3 py-1 text-sm shadow-sm transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-50 ${invalidClass('province', selectedProvinceCode)}`}
                                                    value={selectedProvinceCode}
                                                    onChange={(e) => {
                                                        const code = e.target.value;
                                                        const name = e.target.options[e.target.selectedIndex].text;
                                                        markTouched('province');
                                                        handleProvinceChange(code, name);
                                                    }}
                                                >
                                                    <option value="">Select Province</option>
                                                    {provinces.map((p: any) => (
                                                        <option key={p.code} value={p.code}>{p.name}</option>
                                                    ))}
                                                </select>
                                            </div>

                                            {/* City/Town Dropdown */}
                                            <div>
                                                <label className="text-sm font-medium">City/Town</label>
                                                <select
                                                    className={`flex h-9 w-full rounded-md border border-input bg-background px-3 py-1 text-sm shadow-sm transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-50 ${invalidClass('city_town', selectedCityCode)}`}
                                                    value={selectedCityCode}
                                                    onChange={(e) => {
                                                        const code = e.target.value;
                                                        const name = e.target.options[e.target.selectedIndex].text;
                                                        markTouched('city_town');
                                                        handleCityChange(code, name);
                                                    }}
                                                    disabled={!selectedProvinceCode}
                                                >
                                                    <option value="">Select City/Town</option>
                                                    {cities.map((c: any) => (
                                                        <option key={c.code} value={c.code}>{c.name}</option>
                                                    ))}
                                                </select>
                                            </div>

                                            {/* Barangay Dropdown */}
                                            <div>
                                                <label className="text-sm font-medium">Barangay/Village</label>
                                                <select
                                                    className={`flex h-9 w-full rounded-md border border-input bg-background px-3 py-1 text-sm shadow-sm transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-50 ${invalidClass('barangay_village', selectedBarangayCode)}`}
                                                    value={selectedBarangayCode}
                                                    onChange={(e) => {
                                                        const code = e.target.value;
                                                        const name = e.target.options[e.target.selectedIndex].text;
                                                        markTouched('barangay_village');
                                                        handleBarangayChange(code, name);
                                                    }}
                                                    disabled={!selectedCityCode}
                                                >
                                                    <option value="">Select Barangay</option>
                                                    {barangays.map((b: any) => (
                                                        <option key={b.code} value={b.code}>{b.name}</option>
                                                    ))}
                                                </select>
                                            </div>

                                            <div className="md:col-span-1">
                                                <label className="text-sm font-medium">Unit/House No.</label>
                                                <Input
                                                    className={invalidClass('unit_house_no', formData.unit_house_no)}
                                                    value={formData.unit_house_no}
                                                    onChange={(e) => handleChange('unit_house_no', e.target.value)}
                                                />
                                            </div>

                                            {/* Full address field removed per request */}
                                            <div>
                                                <label className="text-sm font-medium">Telephone #</label>
                                                <Input
                                                    className={invalidClass('telephone_no', formData.telephone_no)}
                                                    value={formData.telephone_no}
                                                    onChange={(e) => handleChange('telephone_no', e.target.value)}
                                                />
                                            </div>
                                            <div>
                                                <label className="text-sm font-medium">Mobile/Contact #</label>
                                                <Input
                                                    className={invalidClass('contact_no', formData.contact_no)}
                                                    value={formData.contact_no}
                                                    onChange={(e) => handleChange('contact_no', e.target.value)}
                                                />
                                            </div>
                                        </div>
                                    </div>

                                    {/* Section 4: Membership & Employment */}
                                    <div className="space-y-4">
                                        <h3 className="text-lg font-semibold border-b pb-2">Membership & Work</h3>
                                        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                                            <div>
                                                <label className="text-sm font-medium">Date of Membership</label>
                                                <Input
                                                    type="date"
                                                    className={invalidClass('date_of_membership', formData.date_of_membership)}
                                                    value={formData.date_of_membership}
                                                    onChange={(e) => handleChange('date_of_membership', e.target.value)}
                                                />
                                            </div>
                                            {/* Membership Type hidden */}
                                            <div>
                                                <label className="text-sm font-medium">Position</label>
                                                <Input value={formData.position} onChange={(e) => handleChange('position', e.target.value)} />
                                            </div>
                                            <div>
                                                <label className="text-sm font-medium">Annual Income</label>
                                                <Input type="number" value={formData.annual_income} onChange={(e) => handleChange('annual_income', e.target.value)} />
                                            </div>
                                            <div>
                                                <label className="text-sm font-medium">Segmentation</label>
                                                <Input value={formData.segmentation} onChange={(e) => handleChange('segmentation', e.target.value)} />
                                            </div>
                                            {/* Representative Status hidden */}
                                            {/* Attendance Status hidden per request */}
                                            {/* Membership Status hidden */}
                                            {/* Membership Update hidden */}
                                            {/* Attend RA hidden */}
                                        </div>
                                    </div>

                                    {/* Section 5: Government IDs */}
                                    <div className="space-y-4">
                                        <h3 className="text-lg font-semibold border-b pb-2">Government IDs</h3>
                                        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                                            <div>
                                                <label className="text-sm font-medium">TIN</label>
                                                <Input value={formData.tin_no} onChange={(e) => handleChange('tin_no', e.target.value)} />
                                            </div>
                                            <div>
                                                <label className="text-sm font-medium">SSS No.</label>
                                                <Input value={formData.sss_no} onChange={(e) => handleChange('sss_no', e.target.value)} />
                                            </div>
                                            <div>
                                                <label className="text-sm font-medium">GSIS No.</label>
                                                <Input value={formData.gsis_no} onChange={(e) => handleChange('gsis_no', e.target.value)} />
                                            </div>
                                        </div>
                                    </div>

                                </CardContent>
                                <div className="p-6 border-t bg-muted/40 shrink-0 flex justify-end gap-2">
                                    <Button type="button" variant="ghost" onClick={() => setIsModalOpen(false)}>Cancel</Button>
                                    <Button type="submit" disabled={saveMutation.isPending}>
                                        <Save className="h-4 w-4 mr-2" /> {editingMember ? 'Update Member' : 'Save Member'}
                                    </Button>
                                </div>
                            </form>
                        </Card>
                    </div>
                )}
            </div>
        </div>
    );
};

// --- New Component for Updates Tab ---
const MemberUpdatesView = ({ user }: { user: any }) => {
    // Determine which branch to query
    // If Super Admin, show all (or can add dropdown later). For now, follow existing pattern: filtered by branch for staff
    const branchId = user?.role === 'SUPER_ADMIN' ? null : user?.branch_id;

    const { data: updates, isLoading } = useQuery({
        queryKey: ['member_updates', branchId],
        queryFn: async () => {
            let q = query(
                collection(db, 'audit_logs'),
                where('entity_type', '==', 'MEMBER')
            );

            if (branchId) {
                q = query(q, where('branch_id', '==', branchId));
            }

            const snapshot = await getDocs(q);
            const logs = snapshot.docs.map(d => ({ id: d.id, ...d.data() } as any));
            // Sort client side by date desc
            return logs.sort((a, b) => (b.created_at?.seconds || 0) - (a.created_at?.seconds || 0));
        },
        enabled: !!user
    });

    const itemsPerPage = 10;
    const [currentPage, setCurrentPage] = useState(1);
    const totalItems = updates?.length || 0;
    const totalPages = Math.ceil(totalItems / itemsPerPage);

    const paginatedUpdates = useMemo(() => {
        if (!updates) return [];
        const start = (currentPage - 1) * itemsPerPage;
        return updates.slice(start, start + itemsPerPage);
    }, [updates, currentPage]);

    useEffect(() => {
        setCurrentPage(1);
    }, [branchId, updates?.length]);

    const handleExportUpdates = () => {
        if (!updates || updates.length === 0) {
            toast.error('No updates to export');
            return;
        }

        const rows = updates.map((log: any) => ({
            'Timestamp': log.created_at?.toDate ? log.created_at.toDate().toLocaleString() : '',
            'Member ID': log.entity_id || '',
            'Updated By': log.actor_name || '',
            'Action': log.action_type || '',
            'Key Changes': log.details || ''
        }));

        const csv = Papa.unparse(rows);
        const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
        const link = document.createElement('a');
        link.href = URL.createObjectURL(blob);
        link.download = `member_profile_updates_${new Date().toISOString().split('T')[0]}.csv`;
        link.click();
    };

    return (
        <Card>
            <CardHeader className="pb-2 flex flex-row items-center justify-between">
                <div>
                    <h3 className="font-semibold text-lg">Profile Update History</h3>
                    <p className="text-sm text-muted-foreground">Log of all member profile changes</p>
                </div>
                <Button variant="outline" onClick={handleExportUpdates} disabled={!updates || updates.length === 0}>
                    <Download className="h-4 w-4 mr-2" /> Export Log
                </Button>
            </CardHeader>
            <CardContent className="p-0">
                <div className="overflow-x-auto">
                    <Table>
                        <TableHeader>
                            <TableRow>
                                <TableHead className="w-[180px]">Timestamp</TableHead>
                                <TableHead>Member ID</TableHead>
                                <TableHead>Updated By</TableHead>
                                <TableHead>Action</TableHead>
                                <TableHead className="w-[40%]">Changes (Remarks)</TableHead>
                            </TableRow>
                        </TableHeader>
                        <TableBody>
                            {isLoading ? (
                                <TableRow><TableCell colSpan={5} className="text-center h-24">Loading updates...</TableCell></TableRow>
                            ) : paginatedUpdates && paginatedUpdates.length > 0 ? (
                                paginatedUpdates.map((log: any) => (
                                    <TableRow key={log.id}>
                                        <TableCell className="text-xs">
                                            {log.created_at?.toDate ? log.created_at.toDate().toLocaleString() : '-'}
                                        </TableCell>
                                        <TableCell className="font-medium">{log.entity_id}</TableCell>
                                        <TableCell>{log.actor_name}</TableCell>
                                        <TableCell>
                                            <Badge variant="outline" className="text-[10px]">{log.action_type}</Badge>
                                        </TableCell>
                                        <TableCell className="text-sm text-muted-foreground">
                                            {log.details}
                                        </TableCell>
                                    </TableRow>
                                ))
                            ) : (
                                <TableRow><TableCell colSpan={5} className="text-center h-24">No updates found</TableCell></TableRow>
                            )}
                        </TableBody>
                    </Table>
                            </div>

                            {/* Pagination UI */}
                            {totalItems > 0 && (
                                <div className="flex items-center justify-between px-4 py-3 border-t bg-muted/20 mt-auto">
                                    <div className="text-sm text-muted-foreground">
                                        Showing {Math.min(totalItems, (currentPage - 1) * itemsPerPage + 1)}-{Math.min(totalItems, currentPage * itemsPerPage)} of {totalItems} members
                                    </div>
                                    <div className="flex gap-2 items-center">
                                        <Button
                                            variant="outline"
                                            size="sm"
                                            onClick={() => setCurrentPage(prev => Math.max(1, prev - 1))}
                                            disabled={currentPage === 1}
                                        >
                                            Previous
                                        </Button>
                                        <div className="text-xs font-medium px-2 whitespace-nowrap">
                                            Page {currentPage} of {totalPages || 1}
                                        </div>
                                        <Button
                                            variant="outline"
                                            size="sm"
                                            onClick={() => setCurrentPage(prev => Math.min(totalPages, prev + 1))}
                                            disabled={currentPage === totalPages || totalPages === 0}
                                        >
                                            Next
                                        </Button>
                                    </div>
                                </div>
                            )}
                        </CardContent>
        </Card>
    );
};

export default MembersPage;
