import { useAuth } from '@/hooks/useAuth';
import { useState, useRef, useEffect } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { db } from '@/lib/firebase';
import { collection, getDocs, addDoc, updateDoc, deleteDoc, doc, Timestamp, query, where } from 'firebase/firestore';
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card';
import { Table, TableHeader, TableRow, TableHead, TableBody, TableCell } from '@/components/ui/table';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Plus, Pencil, Trash2, X, Save, Search, ArrowLeft, Upload, Download, FileSpreadsheet, Loader2 } from 'lucide-react';
import { Link } from 'react-router-dom';
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

    const initialFormState = {
        // IDs & Status
        member_no: '',
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
    };

    const [formData, setFormData] = useState(initialFormState);

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
                // IMPORTANT: Rules require us to filter by branch_id to even READ
                // If we don't filter, the rule "resource.data.origin_branch_id == ..." will fail
                // because it tries to read documents it might no have access to.
                // However, basic "list" rules usually check the query constraints.
                // Firestore security rules for "list" operations check if the query matches the allowed bounds.
                q = query(collection(db, 'members'), where('origin_branch_id', '==', String(user.branch_id)));
            }

            const snapshot = await getDocs(q);
            return snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as any));
        },
        enabled: !!user
    });

    const filteredMembers = members?.filter((m: any) =>
        m.full_name?.toLowerCase().includes(search.toLowerCase()) ||
        m.member_no?.toLowerCase().includes(search.toLowerCase()) ||
        m.cif_key?.toLowerCase().includes(search.toLowerCase())
    );

    const saveMutation = useMutation({
        mutationFn: async (data: any) => {
            // Enforce branch ID for non-super admins
            const finalBranchId = user?.role === 'SUPER_ADMIN' ? data.origin_branch_id : String(user?.branch_id);

            const payload = {
                ...data,
                origin_branch_id: finalBranchId,
                origin_branch: { name: 'Branch ' + finalBranchId, id: finalBranchId },
                created_at: Timestamp.now()
            };
            if (editingMember) {
                await updateDoc(doc(db, 'members', editingMember.id), payload);
            } else {
                await addDoc(collection(db, 'members'), payload);
            }
        },
        onSuccess: () => {
            toast.success(editingMember ? 'Member updated' : 'Member created');
            setIsModalOpen(false);
            setEditingMember(null);
            setFormData(initialFormState);
            queryClient.invalidateQueries({ queryKey: ['members'] });
        }
    });

    const deleteMutation = useMutation({
        mutationFn: async (id: string) => {
            await deleteDoc(doc(db, 'members', id));
        },
        onSuccess: () => {
            toast.success('Member deleted');
            queryClient.invalidateQueries({ queryKey: ['members'] });
        }
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
        // Define specific order for the CSV template
        const headers = [
            'member_no',
            'cif_key',
            'full_name',
            'origin_branch_id',
            'status',
            'birth_date',
            'age',
            'sex',
            'civil_status',
            'spouse_name',
            'educational_attainment',
            'unit_house_no',
            'barangay_village',
            'city_town',
            'province',
            'address',
            'contact_no',
            'telephone_no',
            'date_of_membership',
            'classification',
            'membership_type',
            'position',
            'segmentation',
            'attendance_status',
            'representatives_status',
            'annual_income',
            'tin_no',
            'sss_no',
            'gsis_no'
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
        fileInputRef.current?.click();
    };

    const handleFileUpload = (event: React.ChangeEvent<HTMLInputElement>) => {
        const file = event.target.files?.[0];
        if (!file) return;

        setIsImporting(true);
        Papa.parse(file, {
            header: true,
            skipEmptyLines: true,
            complete: async (results) => {
                const rows = results.data as any[];
                let successCount = 0;
                let errorCount = 0;
                const userBranchId = user?.role === 'SUPER_ADMIN' ? null : String(user?.branch_id);

                for (const row of rows) {
                    try {
                        const branchId = userBranchId || row.origin_branch_id;

                        // Basic validation: must have member_no, full_name, origin_branch_id
                        if (!row.member_no || !row.full_name || !branchId) {
                            console.warn('Skipping invalid row:', row);
                            errorCount++;
                            continue;
                        }

                        // Merge with initial state to ensure all fields exist
                        const payload = {
                            ...initialFormState,
                            ...row,
                            // Ensure numeric fields are strings if they come as numbers or keep as is
                            origin_branch_id: branchId,
                            origin_branch: { name: 'Branch ' + branchId, id: branchId },
                            created_at: Timestamp.now()
                        };

                        await addDoc(collection(db, 'members'), payload);
                        successCount++;
                    } catch (e) {
                        console.error('Import error for row:', row, e);
                        errorCount++;
                    }
                }

                toast.success(`Import complete: ${successCount} added, ${errorCount} skipped.`);
                setIsImporting(false);
                if (fileInputRef.current) fileInputRef.current.value = '';
                queryClient.invalidateQueries({ queryKey: ['members'] });
            },
            error: (error) => {
                toast.error('CSV Parse Error: ' + error.message);
                setIsImporting(false);
                if (fileInputRef.current) fileInputRef.current.value = '';
            }
        });
    };


    const handleEdit = (member: any) => {
        setEditingMember(member);
        setFormData({ ...initialFormState, ...member });
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
        setFormData(prev => ({ ...prev, [field]: value }));
    };

    return (
        <div className="min-h-screen bg-muted/30 p-4 space-y-4">
            <div className="container mx-auto max-w-7xl space-y-4">
                <div className="flex items-center justify-between">
                    <div className="flex items-center gap-4">
                        <Link to="/">
                            <Button variant="ghost" size="icon">
                                <ArrowLeft className="h-4 w-4" />
                            </Button>
                        </Link>
                        <h1 className="text-2xl font-bold">Members Management</h1>
                    </div>

                    <div className="flex gap-2">
                        <input
                            type="file"
                            accept=".csv"
                            ref={fileInputRef}
                            style={{ display: 'none' }}
                            onChange={handleFileUpload}
                        />
                        <Button variant="outline" onClick={handleDownloadTemplate} disabled={isImporting}>
                            <Download className="h-4 w-4 mr-2" /> Template
                        </Button>
                        <Button variant="outline" onClick={handleImportClick} disabled={isImporting}>
                            {isImporting ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <Upload className="h-4 w-4 mr-2" />}
                            Import CSV
                        </Button>
                        <Button onClick={handleAddNew}>
                            <Plus className="h-4 w-4 mr-2" /> Add Member
                        </Button>
                    </div>
                </div>

                <Card>
                    <CardHeader>
                        <div className="flex items-center gap-2">
                            <Search className="h-4 w-4 text-muted-foreground" />
                            <Input
                                placeholder="Search by name, member no, or CIF key..."
                                value={search}
                                onChange={(e) => setSearch(e.target.value)}
                                className="max-w-sm"
                            />
                        </div>
                    </CardHeader>
                    <CardContent className="p-0">
                        <Table>
                            <TableHeader>
                                <TableRow>
                                    <TableHead>Member No</TableHead>
                                    <TableHead>CIF Key</TableHead>
                                    <TableHead>Full Name</TableHead>
                                    <TableHead>Classification</TableHead>
                                    <TableHead>Contact</TableHead>
                                    <TableHead>Status</TableHead>
                                    <TableHead className="text-right">Actions</TableHead>
                                </TableRow>
                            </TableHeader>
                            <TableBody>
                                {isLoading ? (
                                    <TableRow><TableCell colSpan={7} className="text-center h-24">Loading...</TableCell></TableRow>
                                ) : filteredMembers && filteredMembers.length > 0 ? (
                                    filteredMembers.map((m: any) => (
                                        <TableRow key={m.id}>
                                            <TableCell className="font-medium">{m.member_no}</TableCell>
                                            <TableCell>{m.cif_key || '-'}</TableCell>
                                            <TableCell>{m.full_name}</TableCell>
                                            <TableCell>{m.classification || '-'}</TableCell>
                                            <TableCell>{m.contact_no || '-'}</TableCell>
                                            <TableCell>
                                                <Badge variant={m.status === 'ACTIVE' ? 'success' : 'secondary'}>
                                                    {m.status}
                                                </Badge>
                                            </TableCell>
                                            <TableCell className="text-right space-x-2">
                                                <Button variant="ghost" size="icon" onClick={() => handleEdit(m)}>
                                                    <Pencil className="h-4 w-4" />
                                                </Button>
                                                <Button variant="ghost" size="icon" className="text-destructive" onClick={() => {
                                                    if (confirm('Delete this member?')) deleteMutation.mutate(m.id);
                                                }}>
                                                    <Trash2 className="h-4 w-4" />
                                                </Button>
                                            </TableCell>
                                        </TableRow>
                                    ))
                                ) : (
                                    <TableRow><TableCell colSpan={7} className="text-center h-24">No members found</TableCell></TableRow>
                                )}
                            </TableBody>
                        </Table>
                    </CardContent>
                </Card>

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
                                        <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
                                            <div>
                                                <label className="text-sm font-medium">Member No *</label>
                                                <Input required value={formData.member_no} onChange={(e) => handleChange('member_no', e.target.value)} />
                                            </div>
                                            <div>
                                                <label className="text-sm font-medium">CIF Key</label>
                                                <Input value={formData.cif_key} onChange={(e) => handleChange('cif_key', e.target.value)} />
                                            </div>
                                            <div>
                                                <label className="text-sm font-medium">Status</label>
                                                <select className="flex h-9 w-full rounded-md border border-input bg-background px-3"
                                                    value={formData.status} onChange={(e) => handleChange('status', e.target.value)}>
                                                    <option value="ACTIVE">ACTIVE</option>
                                                    <option value="INACTIVE">INACTIVE</option>
                                                </select>
                                            </div>
                                            <div>
                                                <label className="text-sm font-medium">Origin Branch ID *</label>
                                                <Input
                                                    required
                                                    value={formData.origin_branch_id}
                                                    onChange={(e) => handleChange('origin_branch_id', e.target.value)}
                                                    disabled={user?.role !== 'SUPER_ADMIN'}
                                                    className={user?.role !== 'SUPER_ADMIN' ? 'bg-muted' : ''}
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
                                                <Input required value={formData.full_name} onChange={(e) => handleChange('full_name', e.target.value)} />
                                            </div>
                                            <div>
                                                <label className="text-sm font-medium">Birth Date</label>
                                                <Input type="date" value={formData.birth_date} onChange={(e) => handleChange('birth_date', e.target.value)} />
                                            </div>
                                            <div>
                                                <label className="text-sm font-medium">Age</label>
                                                <Input type="number" value={formData.age} onChange={(e) => handleChange('age', e.target.value)} />
                                            </div>
                                            <div>
                                                <label className="text-sm font-medium">Sex</label>
                                                <select className="flex h-9 w-full rounded-md border border-input bg-background px-3"
                                                    value={formData.sex} onChange={(e) => handleChange('sex', e.target.value)}>
                                                    <option value="MALE">MALE</option>
                                                    <option value="FEMALE">FEMALE</option>
                                                </select>
                                            </div>
                                            <div>
                                                <label className="text-sm font-medium">Civil Status</label>
                                                <select className="flex h-9 w-full rounded-md border border-input bg-background px-3"
                                                    value={formData.civil_status} onChange={(e) => handleChange('civil_status', e.target.value)}>
                                                    <option value="SINGLE">SINGLE</option>
                                                    <option value="MARRIED">MARRIED</option>
                                                    <option value="WIDOWED">WIDOWED</option>
                                                    <option value="SEPARATED">SEPARATED</option>
                                                </select>
                                            </div>
                                            <div>
                                                <label className="text-sm font-medium">Spouse Name</label>
                                                <Input value={formData.spouse_name} onChange={(e) => handleChange('spouse_name', e.target.value)} />
                                            </div>
                                            <div>
                                                <label className="text-sm font-medium">Educational Attainment</label>
                                                <Input value={formData.educational_attainment} onChange={(e) => handleChange('educational_attainment', e.target.value)} />
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
                                                    className="flex h-9 w-full rounded-md border border-input bg-background px-3 py-1 text-sm shadow-sm transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-50"
                                                    value={selectedProvinceCode}
                                                    onChange={(e) => {
                                                        const code = e.target.value;
                                                        const name = e.target.options[e.target.selectedIndex].text;
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
                                                    className="flex h-9 w-full rounded-md border border-input bg-background px-3 py-1 text-sm shadow-sm transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-50"
                                                    value={selectedCityCode}
                                                    onChange={(e) => {
                                                        const code = e.target.value;
                                                        const name = e.target.options[e.target.selectedIndex].text;
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
                                                    className="flex h-9 w-full rounded-md border border-input bg-background px-3 py-1 text-sm shadow-sm transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-50"
                                                    value={selectedBarangayCode}
                                                    onChange={(e) => {
                                                        const code = e.target.value;
                                                        const name = e.target.options[e.target.selectedIndex].text;
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
                                                <Input value={formData.unit_house_no} onChange={(e) => handleChange('unit_house_no', e.target.value)} />
                                            </div>

                                            <div className="md:col-span-2">
                                                <label className="text-sm font-medium">Full Address (Legacy/Display)</label>
                                                <Input value={formData.address} onChange={(e) => handleChange('address', e.target.value)} placeholder="Full composite address if needed" />
                                            </div>
                                            <div>
                                                <label className="text-sm font-medium">Telephone #</label>
                                                <Input value={formData.telephone_no} onChange={(e) => handleChange('telephone_no', e.target.value)} />
                                            </div>
                                            <div>
                                                <label className="text-sm font-medium">Mobile/Contact #</label>
                                                <Input value={formData.contact_no} onChange={(e) => handleChange('contact_no', e.target.value)} />
                                            </div>
                                        </div>
                                    </div>

                                    {/* Section 4: Membership & Employment */}
                                    <div className="space-y-4">
                                        <h3 className="text-lg font-semibold border-b pb-2">Membership & Work</h3>
                                        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                                            <div>
                                                <label className="text-sm font-medium">Date of Membership</label>
                                                <Input type="date" value={formData.date_of_membership} onChange={(e) => handleChange('date_of_membership', e.target.value)} />
                                            </div>
                                            <div>
                                                <label className="text-sm font-medium">Membership Type</label>
                                                <Input value={formData.membership_type} onChange={(e) => handleChange('membership_type', e.target.value)} />
                                            </div>
                                            <div>
                                                <label className="text-sm font-medium">Classification</label>
                                                <Input value={formData.classification} onChange={(e) => handleChange('classification', e.target.value)} />
                                            </div>
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
                                                <Input value={formData.segmentation} onChange={(e) => handleChange('segmentation', e.target.value)} disabled />
                                            </div>
                                            <div>
                                                <label className="text-sm font-medium">Representative Status</label>
                                                <Input value={formData.representatives_status} onChange={(e) => handleChange('representatives_status', e.target.value)} disabled />
                                            </div>
                                            <div>
                                                <label className="text-sm font-medium">Attendance Status</label>
                                                <Input value={formData.attendance_status} onChange={(e) => handleChange('attendance_status', e.target.value)} disabled />
                                            </div>
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

export default MembersPage;
